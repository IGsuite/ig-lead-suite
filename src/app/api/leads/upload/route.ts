import { NextResponse } from "next/server";
import Papa from "papaparse";
import {
  HEADER_ALIAS_HELP,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ROWS,
  mapCsvRow,
  normHeader,
} from "@/lib/lead-csv";
import { importLeads } from "@/lib/store";
import { hasUsableContact, verifyContact } from "@/lib/verify";

/**
 * Bulk CSV + Neon chunked writes need headroom.
 * Pro / Fluid can go higher; Hobby still caps shorter — split files if timeouts persist.
 */
export const maxDuration = 300;

const MAX_FILE_BYTES = MAX_UPLOAD_BYTES;
const MAX_ROWS = MAX_UPLOAD_ROWS;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const formSource = String(form.get("source") || "").trim();
    const formGroup = String(form.get("groupName") || "General").trim();
    const purchaseDate = String(form.get("purchaseDate") || "").trim();
    const costDollars = Number(form.get("costDollars") || 0);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `CSV is too large (${Math.round(file.size / 1024)} KB). Max is ${MAX_FILE_BYTES / 1024 / 1024} MB (~${MAX_ROWS.toLocaleString()} rows). Split the file if your host rejects bodies over ~4.5 MB.`,
          code: "file_too_large",
          maxRows: MAX_ROWS,
          maxBytes: MAX_FILE_BYTES,
        },
        { status: 400 },
      );
    }
    if (!formSource || !purchaseDate || !Number.isFinite(costDollars)) {
      return NextResponse.json(
        { error: "Source, purchase date, and cost are required" },
        { status: 400 },
      );
    }

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => normHeader(h),
    });

    if (parsed.errors.length && !parsed.data.length) {
      return NextResponse.json(
        { error: parsed.errors[0]?.message || "Could not parse CSV" },
        { status: 400 },
      );
    }

    if (parsed.data.length > MAX_ROWS) {
      return NextResponse.json(
        {
          error: `CSV has ${parsed.data.length.toLocaleString()} rows; max is ${MAX_ROWS.toLocaleString()} per upload. Split into batches of ≤${MAX_ROWS.toLocaleString()} and import each file.`,
          code: "too_many_rows",
          rowCount: parsed.data.length,
          maxRows: MAX_ROWS,
        },
        { status: 400 },
      );
    }

    const headers = (parsed.meta.fields || []).map(normHeader);
    let skippedEmpty = 0;
    let skippedInvalid = 0;
    const usable: Array<{
      email?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      businessName?: string;
      source?: string;
      groupName?: string;
    }> = [];

    for (const row of parsed.data) {
      const mapped = mapCsvRow(row);
      if (!mapped.email && !mapped.phone) {
        skippedEmpty += 1;
        continue;
      }
      if (
        !hasUsableContact({ email: mapped.email, phone: mapped.phone })
      ) {
        skippedInvalid += 1;
        continue;
      }
      // Form Source / Group win when set; CSV fills gaps for per-row vendor tags.
      usable.push({
        email: mapped.email,
        phone: mapped.phone,
        firstName: mapped.firstName,
        lastName: mapped.lastName,
        businessName: mapped.businessName,
        source: formSource || mapped.source,
        groupName: formGroup || mapped.groupName || "General",
      });
    }

    if (!usable.length) {
      const headerHint = headers.length
        ? `Found columns: ${headers.slice(0, 12).join(", ")}${headers.length > 12 ? "…" : ""}.`
        : "No header row detected.";
      return NextResponse.json(
        {
          error: `No rows with a usable email or phone. ${HEADER_ALIAS_HELP} ${headerHint}`,
          code: "missing_contact_columns",
          headers,
          rowCount: parsed.data.length,
          skippedEmpty,
          skippedInvalid,
        },
        { status: 400 },
      );
    }

    const result = await importLeads({
      filename: file.name,
      source: formSource,
      groupName: formGroup,
      purchaseDate,
      costCents: Math.round(costDollars * 100),
      rows: usable,
    });

    // Mutually exclusive buckets for the toast (phone/email can disagree).
    let valid = 0;
    let invalid = 0;
    let risky = 0;
    for (const l of result.imported) {
      const statuses = [l.emailStatus, l.phoneStatus];
      if (statuses.includes("invalid")) invalid += 1;
      else if (statuses.includes("risky")) risky += 1;
      else if (statuses.includes("valid")) valid += 1;
    }

    // Re-verify counts from import path for response clarity
    let flaggedInvalidContact = 0;
    for (const l of result.imported) {
      const live = verifyContact({ email: l.email, phone: l.phone });
      if (live.emailStatus === "invalid" || live.phoneStatus === "invalid") {
        flaggedInvalidContact += 1;
      }
    }

    return NextResponse.json({
      batch: result.batch,
      importedCount: result.imported.length,
      duplicateCount: result.duplicates,
      skippedEmpty,
      skippedInvalid,
      flaggedInvalidContact,
      rowCount: parsed.data.length,
      maxRows: MAX_ROWS,
      verifiedOnImport: {
        valid,
        invalid,
        risky,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Upload failed unexpectedly";
    console.error("[leads/upload]", message);
    return NextResponse.json(
      {
        error:
          message.includes("timed out") || message.includes("TIMEOUT")
            ? `Import timed out. Split the CSV into batches under ${Math.floor(MAX_ROWS / 3).toLocaleString()} rows and retry.`
            : `Import failed: ${message}`,
        code: "import_failed",
      },
      { status: 500 },
    );
  }
}
