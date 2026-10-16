/**
 * CSV / Excel header normalization + vendor alias map for lead imports.
 * Extra columns are ignored unless mapped here.
 */

import * as XLSX from "xlsx";

export const MAX_UPLOAD_ROWS = 30_000;
/** Soft cap — Vercel serverless body limits may still reject larger payloads (~4.5 MB on some plans). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** Insert batch size for Neon createMany. */
export const LEAD_INSERT_CHUNK = 500;

const EMAIL_ALIASES = [
  "email",
  "email_address",
  "emailaddress",
  "e_mail",
  "e-mail",
  "mail",
  "contact_email",
  "work_email",
  "business_email",
  "primary_email",
  "email1",
  "emails",
  "owner_email",
  "user_email",
];

const PHONE_ALIASES = [
  "phone",
  "phone_number",
  "phonenumber",
  "mobile",
  "mobile_number",
  "mobile_phone",
  "cell",
  "cell_phone",
  "cellphone",
  "telephone",
  "tel",
  "contact_phone",
  "work_phone",
  "business_phone",
  "primary_phone",
  "phone1",
  "sms",
  "sms_phone",
  "owner_phone",
  "direct_phone",
];

const FIRST_NAME_ALIASES = [
  "first_name",
  "firstname",
  "first",
  "fname",
  "given_name",
  "givenname",
  "owner_first_name",
  "contact_first_name",
];

const LAST_NAME_ALIASES = [
  "last_name",
  "lastname",
  "last",
  "lname",
  "surname",
  "family_name",
  "familyname",
  "owner_last_name",
  "contact_last_name",
];

const FULL_NAME_ALIASES = [
  "name",
  "full_name",
  "fullname",
  "contact_name",
  "lead_name",
  "owner_name",
  "contact",
  "full_name_1",
];

const BUSINESS_NAME_ALIASES = [
  "business_name",
  "businessname",
  "business",
  "company",
  "company_name",
  "companyname",
  "organization",
  "organisation",
  "org",
  "org_name",
  "dba",
  "legal_name",
  "account_name",
  "merchant_name",
  "business_legal_name",
];

const SOURCE_ALIASES = [
  "source",
  "lead_source",
  "leadsource",
  "provider",
  "vendor",
  "list_source",
  "origin",
  "utm_source",
];

const GROUP_ALIASES = [
  "group",
  "group_name",
  "groupname",
  "list",
  "list_name",
  "listname",
  "campaign",
  "campaign_name",
  "file",
  "file_name",
  "batch",
  "batch_name",
  "tag",
  "segment",
];

/** Normalize CSV headers: BOM, case, punctuation → underscores. */
export function normHeader(key: string): string {
  return key
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    // "E-Mail Address" → e_mail_address → email_address
    .replace(/e_mail/g, "email");
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
export function splitFullName(full: string): { first?: string; last?: string } {
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

export type MappedLeadRow = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  /** From CSV when present; form values usually override at batch level. */
  source?: string;
  groupName?: string;
};

export function mapCsvRow(row: Record<string, string>): MappedLeadRow {
  const cols = rowMap(row);
  const email = pickFrom(cols, EMAIL_ALIASES);
  const phone = pickFrom(cols, PHONE_ALIASES);
  let firstName = pickFrom(cols, FIRST_NAME_ALIASES);
  let lastName = pickFrom(cols, LAST_NAME_ALIASES);
  if (!firstName && !lastName) {
    const full = pickFrom(cols, FULL_NAME_ALIASES);
    if (full) {
      const split = splitFullName(full);
      firstName = split.first;
      lastName = split.last;
    }
  }
  return {
    email,
    phone,
    firstName,
    lastName,
    businessName: pickFrom(cols, BUSINESS_NAME_ALIASES),
    source: pickFrom(cols, SOURCE_ALIASES),
    groupName: pickFrom(cols, GROUP_ALIASES),
  };
}

export const HEADER_ALIAS_HELP =
  "Use columns like email, phone, first_name, last_name, business_name/company, source, group/list (spaces OK). Extra columns are ignored.";

const EXCEL_EXT = /\.(xlsx|xls|xlsm)$/i;
const EXCEL_MIME =
  /^(application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel|application\/vnd\.ms-excel\.sheet\.macroenabled\.12)$/i;

/** True when filename or MIME clearly indicates Excel. */
export function isExcelUpload(file: { name: string; type?: string }): boolean {
  if (EXCEL_EXT.test(file.name || "")) return true;
  return EXCEL_MIME.test((file.type || "").trim());
}

/** ZIP (xlsx) or OLE Compound (xls) magic bytes. */
export function hasExcelMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  // PK\x03\x04 — OOXML zip
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  ) {
    return true;
  }
  // D0 CF 11 E0 — OLE (.xls)
  if (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return true;
  }
  return false;
}

/**
 * Drop binary / zip-path junk so error messages never dump xlsx internals
 * (e.g. "xl/drawings/drawing1.xml", "pk…").
 */
export function sanitizeHeadersForDisplay(headers: string[]): string[] {
  const out: string[] = [];
  for (const raw of headers) {
    const s = String(raw ?? "")
      .replace(/\u0000/g, "")
      .replace(/^\uFEFF/, "")
      .trim();
    if (!s || s.length > 64) continue;
    // Printable ASCII only
    if (!/^[\x20-\x7E]+$/.test(s)) continue;
    // Zip / OOXML debris that appears when Excel is mis-read as CSV
    if (
      /^(pk|xl\/|\[content_types\]|docprops|_rels|\[trash\])/i.test(s) ||
      /\.(xml|rels|bin|vml|png|jpg|jpeg|emf|wmf)(\b|$)/i.test(s) ||
      /drawing\d*/i.test(s)
    ) {
      continue;
    }
    // Must look like a column header after normalization
    const n = normHeader(s);
    if (!n || n.length < 1 || n.length > 48) continue;
    if (!/^[a-z][a-z0-9_]*$/.test(n)) continue;
    out.push(n);
  }
  return out;
}

export function formatFoundColumns(headers: string[]): string {
  const safe = sanitizeHeadersForDisplay(headers).slice(0, 12);
  if (!safe.length) {
    return "No readable header row detected.";
  }
  const more = sanitizeHeadersForDisplay(headers).length > 12 ? "…" : "";
  return `Found columns: ${safe.join(", ")}${more}.`;
}

export type ParsedLeadTable = {
  data: Record<string, string>[];
  headers: string[];
  format: "csv" | "xlsx";
};

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return String(value).trim();
}

/** Parse first sheet of an .xlsx / .xls workbook into string rows. */
export function parseExcelBuffer(buffer: ArrayBuffer | Uint8Array): ParsedLeadTable {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { data: [], headers: [], format: "xlsx" };
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  if (!matrix.length) {
    return { data: [], headers: [], format: "xlsx" };
  }

  const headerCells = (matrix[0] || []).map((h) => cellToString(h));
  const headers = headerCells.map(normHeader);
  const data: Record<string, string>[] = [];

  for (let r = 1; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    const obj: Record<string, string> = {};
    let any = false;
    for (let c = 0; c < headers.length; c += 1) {
      const key = headers[c];
      if (!key) continue;
      const val = cellToString(row[c]);
      if (val) any = true;
      // Prefer first non-empty if duplicate normalized headers collide
      if (obj[key] === undefined || (!obj[key] && val)) obj[key] = val;
    }
    if (any) data.push(obj);
  }

  return {
    data,
    headers: headers.filter(Boolean),
    format: "xlsx",
  };
}

export const EXCEL_AS_CSV_ERROR =
  "This is an Excel file (.xlsx/.xls), not CSV. Upload the Excel file directly, or save as CSV (File → Save As → CSV) and try again.";
