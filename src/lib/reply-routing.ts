import { createHash } from "node:crypto";
import type { Brand, CampaignChannel, ReplyContext } from "@/lib/types";

export type InboundReply = {
  id?: string;
  channel: CampaignChannel;
  from: string;
  body: string;
  brandId: string;
  campaignId?: string;
  leadId?: string;
  providerContext?: ReplyContext;
};

export function emailAddress(value: string): string {
  return (value.match(/<([^<>]+)>/)?.[1] || value).trim().toLowerCase();
}

export function mailboxMatchesBrand(mailbox: string, brand: Brand): boolean {
  const domain = emailAddress(mailbox).split("@")[1];
  return Boolean(domain && [brand.domain, brand.sendingSubdomain].some((d) =>
    domain === d?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""),
  ));
}

export function phoneIdentity(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `1${digits}` : digits;
}

/** Fail closed for unknown/shared identities instead of routing to the last offered brand. */
export function resolveReplyBrand(
  brands: Brand[],
  input: { channel: CampaignChannel; mailbox?: string; providerCampaignId?: string; brandId?: string },
  env: Record<string, string | undefined> = process.env,
): Brand {
  const identityMatches = input.mailbox
    ? brands.filter((b) => input.channel === "email"
      ? mailboxMatchesBrand(input.mailbox!, b)
      : b.phoneNumbers.some((p) => phoneIdentity(p) === phoneIdentity(input.mailbox!)))
    : [];
  const campaignMatches = input.providerCampaignId
    ? brands.filter((b) => {
      const prefix = `SMARTLEAD_CAMPAIGN_${b.id.toUpperCase()}`;
      return Object.entries(env).some(([key, value]) => (key === prefix || key.startsWith(`${prefix}__`)) && value?.trim() === input.providerCampaignId);
    })
    : [];
  if (identityMatches.length > 1 || campaignMatches.length > 1)
    throw new Error("Receiving identity or provider campaign is shared across brands. Configure a distinct identity for each portal.");
  const explicit = input.brandId ? brands.find((b) => b.id === input.brandId) : undefined;
  if (input.brandId && !explicit) throw new Error("Unknown entity");
  const choices = [explicit, identityMatches[0], campaignMatches[0]].filter((b): b is Brand => Boolean(b));
  if (!choices.length || new Set(choices.map((b) => b.id)).size !== 1)
    throw new Error("Reply could not be matched to one portal. Check the receiving mailbox/number and campaign mapping.");
  // An explicit campaign mapping must not bypass an unrelated receiving mailbox.
  if (input.mailbox && !identityMatches.length)
    throw new Error("Receiving mailbox/number is not assigned to this entity");
  return choices[0];
}

export function inboundReplyId(provider: string, parts: unknown[]): string {
  return `reply-${provider}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 40)}`;
}

export function plainEmail(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}
