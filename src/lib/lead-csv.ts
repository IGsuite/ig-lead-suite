/**
 * CSV header normalization + vendor alias map for lead imports.
 * Extra columns are ignored unless mapped here.
 */

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
  "email, phone, first_name, last_name, business_name/company, source, group/list (spaces OK). Extra columns are ignored.";
