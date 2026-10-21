/**
 * Campaign source/group filters are stored as a string:
 * - "all" — no filter
 * - single value — exact match
 * - comma-separated — match any (multi-select)
 */

export function parseAudienceFilter(filter: string | null | undefined): "all" | string[] {
  const raw = (filter || "all").trim();
  if (!raw || raw === "all") return "all";
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "all";
  if (parts.length === 1 && parts[0] === "all") return "all";
  return Array.from(new Set(parts));
}

export function serializeAudienceFilter(selected: string[]): string {
  const cleaned = selected.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0 || cleaned.includes("all")) return "all";
  return Array.from(new Set(cleaned)).join(",");
}

export function matchesAudienceFilter(
  value: string | null | undefined,
  filter: string | null | undefined,
): boolean {
  if (filter === AUDIENCE_NOT_SELECTED) return false;
  const parsed = parseAudienceFilter(filter);
  if (parsed === "all") return true;
  const v = (value || "").trim();
  return parsed.includes(v);
}

/** A saved draft awaiting the operator's deliberate source choice; never matches a lead. */
export const AUDIENCE_NOT_SELECTED = "__audience_not_selected__";

export function toggleAudienceValue(
  current: string[],
  value: string,
  checked: boolean,
): string[] {
  if (value === "all") return checked ? [] : current;
  const set = new Set(current);
  if (checked) set.add(value);
  else set.delete(value);
  return Array.from(set);
}
