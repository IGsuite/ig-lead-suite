import type { Lead, SmsConsent } from "@/lib/types";

export const SMS_DISCLOSURE_VERSION = "abstract-sms-2026-10-20-v1";
export const SMS_DISCLOSURE = "I agree to receive marketing texts from Abstract Capital Group about business advisory services and financing assistance, including messages sent using automated technology. Consent is not a condition of purchasing services. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for help.";
export const SMS_PRIVACY = "Mobile information, SMS opt-in data, and SMS consent will not be sold or shared with third parties for their own promotional or marketing purposes. Service providers may process this information only to operate our messaging program.";

export function smsPhone(value?: string): string {
  const digits = (value || "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? `+1${national}` : "";
}

export function readSmsConsents(value: unknown): SmsConsent[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SmsConsent => Boolean(item && typeof item === "object" &&
    typeof item.id === "string" && typeof item.brandId === "string" && typeof item.phone === "string" &&
    ["granted", "revoked"].includes(item.status) && typeof item.recordedAt === "string" &&
    Number.isFinite(Date.parse(item.recordedAt)) && typeof item.sourceUrl === "string" &&
    typeof item.disclosure === "string" && typeof item.disclosureVersion === "string" && ["web_form", "operator"].includes(item.method)));
}

export function hasSmsMarketingConsent(lead: Lead, brandId: string, now = Date.now()): boolean {
  const phone = smsPhone(lead.phone);
  if (!phone || lead.optedOut || lead.status === "opted_out") return false;
  const choices = readSmsConsents(lead.smsConsents).filter(c => c.brandId === brandId && smsPhone(c.phone) === phone);
  // Array order is the durable event order, including choices recorded in the same millisecond.
  const latest = choices.at(-1);
  return Boolean(latest && latest.status === "granted" && latest.method === "web_form" && Date.parse(latest.recordedAt) <= now &&
    latest.disclosure.trim() && latest.disclosureVersion.trim() && /^https:\/\//.test(latest.sourceUrl));
}
