/**
 * Smoke-test Excel → lead row mapping (no DB).
 * Run: npx tsx scripts/probe-xlsx-import.ts
 */
import * as XLSX from "xlsx";
import {
  formatFoundColumns,
  mapCsvRow,
  parseExcelBuffer,
  sanitizeHeadersForDisplay,
} from "../src/lib/lead-csv";

function buildSampleXlsx(): Uint8Array {
  const rows = [
    ["Email", "Phone", "First Name", "Last Name", "Company", "Source"],
    [
      "a@example.com",
      "5551112222",
      "Ada",
      "Lovelace",
      "Analytical Engines",
      "LeadForge",
    ],
    ["b@example.com", "", "Grace", "Hopper", "USN", "VendorX"],
    ["", "5553334444", "Alan", "Turing", "Bletchley", ""],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Leads");
  const written = XLSX.write(book, { type: "array", bookType: "xlsx" });
  return written instanceof Uint8Array
    ? written
    : new Uint8Array(written as ArrayBuffer);
}

const table = parseExcelBuffer(buildSampleXlsx());
console.log("format:", table.format);
console.log("headers:", table.headers);
console.log("rows:", table.data.length);
const mapped = table.data.map(mapCsvRow);
console.log(
  "mapped:",
  mapped.map((m) => ({
    email: m.email,
    phone: m.phone,
    first: m.firstName,
    biz: m.businessName,
    source: m.source,
  })),
);

const junk = [
  "pk",
  "xl/drawings/drawing1.xml",
  "[Content_Types].xml",
  "email",
  "phone",
  "\x00\x01binary",
];
console.log("sanitized:", sanitizeHeadersForDisplay(junk));
console.log("found:", formatFoundColumns(junk));

if (table.data.length !== 3) throw new Error("expected 3 data rows");
if (!mapped[0]?.email || !mapped[0]?.phone) throw new Error("row0 mapping failed");
if (sanitizeHeadersForDisplay(junk).join(",") !== "email,phone") {
  throw new Error("sanitize failed");
}
console.log("OK");
