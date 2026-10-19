/**
 * Reproduces the production empty-audience case:
 * Manual source + preferUnoffered + lead already offered to Abstract → 0 selected.
 */
import { createHash } from "crypto";

function messageFingerprint(channel, message, subject) {
  const raw = [
    channel,
    (subject || "").trim().toLowerCase(),
    message.trim().toLowerCase().replace(/\s+/g, " "),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 20);
}

function matchesAudienceFilter(value, filter) {
  if (!filter || filter === "all") return true;
  const parts = String(filter)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.includes("all")) return true;
  return parts.includes(value);
}

function isLeadEligibleForEntity(lead, entityId, options) {
  if (lead.optedOut || lead.status === "opted_out") return false;
  if (lead.status === "converted" || lead.convertedEntityId) return false;
  if (!matchesAudienceFilter(lead.source, options.sourceFilter)) return false;
  if (!matchesAudienceFilter(lead.groupName, options.groupFilter || "all"))
    return false;
  if (options.channel === "email" && !lead.email) return false;
  if (options.preferUnoffered && lead.offeredEntityIds.includes(entityId))
    return false;
  if (
    options.preferVerified &&
    lead.emailStatus !== "valid" &&
    lead.emailStatus !== "risky"
  )
    return false;
  return true;
}

function selectLeadsForSend(input) {
  const preferUnoffered =
    input.mode === "own" ? (input.preferUnoffered ?? true) : false;
  const eligible = input.leads.filter((lead) =>
    isLeadEligibleForEntity(lead, input.entityId, {
      channel: input.channel,
      sourceFilter: input.sourceFilter,
      groupFilter: input.groupFilter,
      preferUnoffered,
      preferVerified: input.preferVerified ?? true,
    }),
  );
  return {
    selected: eligible.slice(0, input.volume),
    eligibleCount: eligible.length,
  };
}

const lead = {
  id: "lead-manual-test",
  email: "i***@gmail.com",
  emailStatus: "valid",
  status: "contacted",
  source: "Manual",
  groupName: "Manual",
  offeredEntityIds: ["abstract"],
  optedOut: false,
  convertedEntityId: null,
};

const base = {
  leads: [lead],
  sendEvents: [],
  entityId: "abstract",
  channel: "email",
  volume: 10,
  mode: "own",
  messageFingerprint: messageFingerprint(
    "email",
    "Hi {{firstName}}",
    "Working capital",
  ),
  sourceFilter: "Manual",
  groupFilter: "all",
  preferVerified: true,
};

const blocked = selectLeadsForSend({ ...base, preferUnoffered: true });
const allowed = selectLeadsForSend({ ...base, preferUnoffered: false });

console.log(
  JSON.stringify({
    withPreferUnoffered: blocked,
    withoutPreferUnoffered: allowed,
  }),
);

if (blocked.eligibleCount !== 0) {
  console.error("FAIL: preferUnoffered should exclude already-offered Manual lead");
  process.exit(1);
}
if (allowed.eligibleCount !== 1 || allowed.selected.length !== 1) {
  console.error("FAIL: unchecking preferUnoffered should select the Manual lead");
  process.exit(1);
}
console.log("PASS: empty-audience root cause reproduced; uncheck preferUnoffered fixes it");
