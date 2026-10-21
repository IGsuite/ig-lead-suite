import { createHmac, randomUUID } from "node:crypto";
import { getPrisma, isNeonConfigured } from "@/lib/db";
import { readSmsConsents, smsPhone, SMS_DISCLOSURE, SMS_DISCLOSURE_VERSION } from "@/lib/sms-consent";
import type { SmsConsent } from "@/lib/types";

export class ConsentLimitError extends Error {}

export async function subscribeAbstractSms(phoneInput: string, sourceUrl: string, visitor: string) {
  if (!isNeonConfigured()) throw new Error("Consent storage is unavailable");
  const phone = smsPhone(phoneInput);
  if (!phone) throw new Error("Enter a valid US phone number");
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Consent intake is unavailable");
  const bucket = Math.floor(Date.now() / 3600000);
  const visitorKey = createHmac("sha256", secret).update(`sms-intake:${bucket}:${visitor}`).digest("hex");
  return getPrisma().$transaction(async tx => {
    const limits = await tx.$queryRaw<Array<{ count: number }>>`INSERT INTO "ConsentRateLimit" (id, count, "expiresAt") VALUES (${visitorKey}, 1, NOW() + interval '1 hour') ON CONFLICT (id) DO UPDATE SET count = "ConsentRateLimit".count + 1 RETURNING count`;
    if (limits[0].count > 5) throw new ConsentLimitError("Please try again later");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sms-consent:${phone}`}))`;
    const leads = await tx.lead.findMany({ where: { phone: { not: null } } });
    const matching = leads.filter(l => smsPhone(l.phone || "") === phone);
    const suppressed = await tx.optOut.findMany({ where: { channel: { in: ["sms", "both"] } } });
    // A web submission never clears an existing suppression or another lead's STOP.
    if (matching.some(l => l.optedOut || l.status === "opted_out") || suppressed.some(o => smsPhone(o.contact) === phone)) return;
    let lead = matching[0];
    if (!lead) lead = await tx.lead.create({ data: {
      id: `lead-sms-${randomUUID()}`, phone, source: "Website SMS signup", groupName: "SMS opt-in",
      purchaseDate: new Date(), costCents: 0, offeredEntityIds: [], lastEntityId: "abstract",
      status: "available", phoneStatus: "valid", emailStatus: "unverified",
    } });
    await tx.$executeRaw`SELECT id FROM "Lead" WHERE id = ${lead.id} FOR UPDATE`;
    lead = await tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
    if (lead.optedOut || lead.status === "opted_out") return;
    const consent: SmsConsent = { id: randomUUID(), brandId: "abstract", phone, status: "granted",
      recordedAt: new Date().toISOString(), sourceUrl, disclosure: SMS_DISCLOSURE,
      disclosureVersion: SMS_DISCLOSURE_VERSION, method: "web_form" };
    await tx.lead.update({ where: { id: lead.id }, data: { smsConsents: [...readSmsConsents(lead.smsConsents), consent].map(c => ({ ...c })) } });
  }, { timeout: 20000 });
}

export async function withdrawSmsConsent(leadId: string, brandId: string, recordedBy = "operator") {
  return getPrisma().$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "Lead" WHERE id = ${leadId} FOR UPDATE`;
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
    const choices = readSmsConsents(lead.smsConsents);
    const prior = choices.findLast(c => c.brandId === brandId && smsPhone(c.phone) === smsPhone(lead.phone || ""));
    if (!prior || prior.status === "revoked") return;
    const revoked: SmsConsent = { ...prior, id: randomUUID(), status: "revoked", method: "operator", recordedBy, recordedAt: new Date().toISOString() };
    await tx.lead.update({ where: { id: leadId }, data: { smsConsents: [...choices, revoked].map(c => ({ ...c })) } });
  });
}
