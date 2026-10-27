export type ReadinessState = "active" | "inactive" | "pending" | "needs_attention" | "not_connected";
export type ReadinessCheck = { id: string; title: string; state: ReadinessState; detail: string; href?: string; linkLabel?: string };
export type NumberAssignment = { assignmentStatus?: string; tmobileNumberMappingStatus?: string | null; attNumberMappingStatus?: string | null; nonTmobileNumberMappingStatus?: string | null };

/** Campaign approval never substitutes for the sender number's assignment. */
export function smsRegistrationState(campaign: { status?: string; campaignStatus?: string }, assignment: NumberAssignment): ReadinessState {
  const current = [campaign.campaignStatus, assignment.assignmentStatus, assignment.tmobileNumberMappingStatus, assignment.attNumberMappingStatus, assignment.nonTmobileNumberMappingStatus].filter(Boolean) as string[];
  if (current.some(s => /FAIL|REJECT|DECLIN|SUSPEND|TERMINAT/i.test(s)) || campaign.status === "EXPIRED") return "needs_attention";
  if (campaign.status !== "ACTIVE" || campaign.campaignStatus !== "MNO_PROVISIONED" || assignment.assignmentStatus !== "ASSIGNED" || current.some(s => /PENDING/i.test(s))) return "pending";
  return "active";
}

export function uniqueCompanyNumber(number: string | undefined, otherNumbers: string[][]): boolean {
  const normalize = (n: string) => n.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return Boolean(number && normalize(number) && !otherNumbers.some(numbers => numbers.some(other => normalize(other) === normalize(number))));
}

export function mailboxBelongsToCompany(email: unknown, domain: string): boolean {
  if (typeof email !== "string" || !domain.trim()) return false;
  const host = domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  const mailboxDomain = email.trim().toLowerCase().split("@")[1];
  return Boolean(mailboxDomain && (mailboxDomain === host || mailboxDomain.endsWith(`.${host}`)));
}

export function setupReadiness(status?: string): ReadinessState {
  return status === "tested" ? "active" : status === "not_applicable" ? "inactive" : status === "needs_owner" ? "needs_attention" : status && status !== "not_started" ? "pending" : "not_connected";
}

export type CompanyGoLive = {
  companies: Array<{ id: string; name: string }>;
  company: { id: string; name: string; domain: string; website: string };
  messaging: ReadinessCheck[];
  connections: ReadinessCheck[];
  infrastructure: ReadinessCheck[];
  checkedAt: string;
};
