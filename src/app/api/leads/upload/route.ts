import { del } from "@vercel/blob";
import { formWithUploadedFile } from "@/lib/uploads";
import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import Papa from "papaparse";
import {
  EXCEL_AS_CSV_ERROR,
  HEADER_ALIAS_HELP,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ROWS,
  formatFoundColumns,
  hasExcelMagic,
  isExcelUpload,
  mapCsvRow,
  normHeader,
  parseExcelBuffer,
  sanitizeHeadersForDisplay,
  type ParsedLeadTable,
} from "@/lib/lead-csv";
import { importLeads } from "@/lib/store";
import { hasUsableContact, verifyContact } from "@/lib/verify";

/**
 * Bulk CSV/Excel + Neon chunked writes need headroom.
 * Pro / Fluid can go higher; Hobby still caps shorter — split files if timeouts persist.
 */
export const maxDuration = 300;

const MAX_FILE_BYTES = MAX_UPLOAD_BYTES;
const MAX_ROWS = MAX_UPLOAD_ROWS;

function parseCsvText(text: string): ParsedLeadTable {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normHeader(h),
  });

  if (parsed.errors.length && !parsed.data.length) {
    throw new Error(parsed.errors[0]?.message || "Could not parse CSV");
  }

  const headers = (parsed.meta.fields || []).map(normHeader);
  return {
    data: parsed.data,
    headers,
    format: "csv",
  };
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    const reference = request.headers.get("content-type")?.includes("application/json") ? (await request.clone().json()).blobPath : undefined;
    const form = await formWithUploadedFile(request, MAX_FILE_BYTES);
    const file = form.get("file");
    const formSource = String(form.get("source") || "").trim();
    const formGroup = String(form.get("groupName") || "General").trim();
    const purchaseDate = String(form.get("purchaseDate") || "").trim();
    const costDollars = Number(form.get("costDollars") || 0);

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSV or Excel (.xlsx) file is required" },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `File is too large (${Math.round(file.size / 1024)} KB). Max is ${MAX_FILE_BYTES / 1024 / 1024} MB (~${MAX_ROWS.toLocaleString()} rows). Split the file if your host rejects bodies over ~4.5 MB.`,
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

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const excelByName = isExcelUpload(file);
    const excelByMagic = hasExcelMagic(bytes);

    let table: ParsedLeadTable;

    if (excelByName || excelByMagic) {
      try {
        table = parseExcelBuffer(buffer);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        return NextResponse.json(
          {
            error: `Could not read Excel file. ${EXCEL_AS_CSV_ERROR} (${msg})`,
            code: "excel_parse_failed",
          },
          { status: 400 },
        );
      }
    } else {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      // Heuristic: OOXML path fragments in "CSV" text
      if (
        /xl\/(worksheets|drawings|sharedStrings)/i.test(text.slice(0, 8000)) ||
        /\[Content_Types\]\.xml/i.test(text.slice(0, 2000))
      ) {
        return NextResponse.json(
          { error: EXCEL_AS_CSV_ERROR, code: "excel_not_csv" },
          { status: 400 },
        );
      }
      try {
        table = parseCsvText(text);
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error ? err.message : "Could not parse CSV",
            code: "csv_parse_failed",
          },
          { status: 400 },
        );
      }
    }

    if (table.data.length > MAX_ROWS) {
      return NextResponse.json(
        {
          error: `File has ${table.data.length.toLocaleString()} rows; max is ${MAX_ROWS.toLocaleString()} per upload. Split into batches of ≤${MAX_ROWS.toLocaleString()} and import each file.`,
          code: "too_many_rows",
          rowCount: table.data.length,
          maxRows: MAX_ROWS,
        },
        { status: 400 },
      );
    }

    const headers = table.headers.map(normHeader);
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

    for (const row of table.data) {
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
      // Form Source / Group win when set; file fills gaps for per-row vendor tags.
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
      const safeHeaders = sanitizeHeadersForDisplay(headers);
      const headerHint = formatFoundColumns(headers);
      return NextResponse.json(
        {
          error: `No rows with a usable email or phone. ${HEADER_ALIAS_HELP} ${headerHint}`,
          code: "missing_contact_columns",
          headers: safeHeaders,
          rowCount: table.data.length,
          skippedEmpty,
          skippedInvalid,
          format: table.format,
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

    if (reference) await del(reference).catch(() => undefined);
    return NextResponse.json({
      batch: result.batch,
      importedCount: result.imported.length,
      duplicateCount: result.duplicates,
      skippedEmpty,
      skippedInvalid,
      flaggedInvalidContact,
      rowCount: table.data.length,
      maxRows: MAX_ROWS,
      format: table.format,
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
            ? `Import timed out. Split the file into batches under ${Math.floor(MAX_ROWS / 3).toLocaleString()} rows and retry.`
            : `Import failed: ${message}`,
        code: "import_failed",
      },
      { status: 500 },
    );
  }
}
