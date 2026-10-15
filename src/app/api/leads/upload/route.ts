import { NextResponse } from "next/server";
import Papa from "papaparse";
import { importLeads } from "@/lib/store";

/** Hobby default is ~10s; bulk CSV + Neon write needs headroom on Pro / Fluid. */
export const maxDuration = 60;

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB multipart body is well under Vercel limits
const MAX_ROWS = 5_000;

/** Normalize CSV headers: BOM, case, spaces/dashes → underscores. */
function normHeader(key: string): string {
  return key
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function rowMap(row: Record<string, string>): Map<string, string> {
  const normalized = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) {
    normalized.set(normHeader(k), typeof v === "string" ? v : String(v ?? ""));
  }
  return normalized;
}

function pickFrom(
  normalized: Map<string, string>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = normalized.get(normHeader(key));
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

/** Split "Jane Doe" / "Doe, Jane" when first/last columns are absent. */
function splitFullName(full: string): { first?: string; last?: string } {
  const name = full.trim().replace(/\s+/g, " ");
  if (!name) return {};
  if (name.includes(",")) {
    const [last, ...rest] = name.split(",").map((p) => p.trim()).filter(Boolean);
    const first = rest.join(" ").trim();
    return {
      first: first || undefined,
      last: last || undefined,
    };
  }
  const parts = name.split(" ");
  if (parts.length === 1) return { first: parts[0] };
  return {
    first: parts[0],
    last: parts.slice(1).join(" "),
  };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const source = String(form.get("source") || "").trim();
    const groupName = String(form.get("groupName") || "General").trim();
    const purchaseDate = String(form.get("purchaseDate") || "").trim();
    const costDollars = Number(form.get("costDollars") || 0);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `CSV is too large (${Math.round(file.size / 1024)} KB). Max is ${MAX_FILE_BYTES / 1024 / 1024} MB (~${MAX_ROWS.toLocaleString()} rows).`,
        },
        { status: 400 },
      );
    }
    if (!source || !purchaseDate || !Number.isFinite(costDollars)) {
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
          error: `CSV has ${parsed.data.length.toLocaleString()} rows; max is ${MAX_ROWS.toLocaleString()} per upload. Split the file and import in batches.`,
        },
        { status: 400 },
      );
    }

    const headers = (parsed.meta.fields || []).map(normHeader);
    const rows = parsed.data.map((row) => {
      const cols = rowMap(row);
      const email = pickFrom(cols, [
        "email",
        "email_address",
        "emailaddress",
        "e_mail",
        "e-mail",
        "mail",
        "contact_email",
      ]);
      const phone = pickFrom(cols, [
        "phone",
        "phone_number",
        "phonenumber",
        "mobile",
        "mobile_number",
        "cell",
        "cell_phone",
        "cellphone",
        "telephone",
        "tel",
        "contact_phone",
      ]);
      let firstName = pickFrom(cols, [
        "first_name",
        "firstname",
        "first",
        "fname",
        "given_name",
      ]);
      let lastName = pickFrom(cols, [
        "last_name",
        "lastname",
        "last",
        "lname",
        "surname",
        "family_name",
      ]);
      if (!firstName && !lastName) {
        const full = pickFrom(cols, [
          "name",
          "full_name",
          "fullname",
          "contact_name",
          "lead_name",
        ]);
        if (full) {
          const split = splitFullName(full);
          firstName = split.first;
          lastName = split.last;
        }
      }
      return { email, phone, firstName, lastName };
    });

    const skippedEmpty = rows.filter((r) => !r.email && !r.phone).length;
    const usable = rows.filter((r) => r.email || r.phone);

    if (!usable.length) {
      const headerHint = headers.length
        ? `Found columns: ${headers.slice(0, 12).join(", ")}${headers.length > 12 ? "…" : ""}.`
        : "No header row detected.";
      return NextResponse.json(
        {
          error: `No rows with email or phone. Use columns like email, phone, first_name, last_name (spaces OK: "Email Address", "Phone Number"). ${headerHint}`,
          code: "missing_contact_columns",
          headers,
          rowCount: rows.length,
          skippedEmpty,
        },
        { status: 400 },
      );
    }

    const result = await importLeads({
      filename: file.name,
      source,
      groupName,
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

    return NextResponse.json({
      batch: result.batch,
      importedCount: result.imported.length,
      duplicateCount: result.duplicates,
      skippedEmpty,
      rowCount: rows.length,
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
            ? "Import timed out. Try a smaller CSV (under 1,000 rows) and retry."
            : `Import failed: ${message}`,
      },
      { status: 500 },
    );
  }
}
