import Papa from "papaparse";
import { normHeader, mapCsvRow } from "@/lib/lead-csv";

export const BULK_MAX_BYTES = 200 * 1024 * 1024;
export const BULK_MAX_ROWS = 1_000_000;
export const BULK_READ_BYTES = 512 * 1024;
export const BULK_CHUNK_ROWS = 1_000;
export const BULK_EXCEL_MAX_BYTES = 20 * 1024 * 1024;

/** Byte checkpoints are always after a whole CSV record, including quoted newlines. */
export function csvRecords(bytes: Uint8Array, eof: boolean, limit = BULK_CHUNK_ROWS) {
  const records: { values: string[]; end: number }[] = [];
  let quoted = false, start = 0;
  function append(end: number) {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start, end));
    const parsed = Papa.parse<string[]>(text.replace(/\r?\n$/, ""), { skipEmptyLines: false });
    if (parsed.errors.length || parsed.data.length !== 1) throw new Error("Malformed CSV record. Save the file as UTF-8 CSV and retry.");
    records.push({ values: parsed.data[0], end });
    start = end;
  }
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 34) {
      if (quoted && bytes[i + 1] === 34) { i++; continue; }
      quoted = !quoted;
    } else if (bytes[i] === 10 && !quoted) {
      append(i + 1);
      if (records.length >= limit) return records;
    }
    if (i - start > 256 * 1024) throw new Error("A CSV record exceeds 256 KB. Remove oversized extra fields and retry.");
  }
  if (eof && start < bytes.length) {
    if (quoted) throw new Error("CSV ends inside a quoted field.");
    append(bytes.length);
  }
  if (!records.length && bytes.length && !eof) throw new Error("CSV record is too large or has an unmatched quote.");
  return records;
}

export function csvHeaders(values: string[]) {
  const headers = values.map(normHeader);
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error("CSV contains duplicate column names. Give each column a unique name.");
  const mapped=mapCsvRow(Object.fromEntries(headers.map(h=>[h,"candidate"])));
  if (!mapped.email&&!mapped.phone) throw new Error("No email or phone header was found. Use email, phone, mobile, or contact_email columns.");
  return headers;
}

export function emailKey(value?: string | null) { return value?.trim().toLowerCase() || ""; }
export function phoneKey(value?: string | null) {
  const digits = value?.replace(/\D/g, "") || "";
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}
