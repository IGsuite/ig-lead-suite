import type { Brand, CampaignChannel, MessageTemplate } from "@/lib/types";

export function validatePrograms(brand: Pick<Brand,"programs"> | null | undefined, value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30 || value.some(p => typeof p !== "string" || !brand?.programs.includes(p))) throw new Error("Choose funding programs belonging to this company");
  return Array.from(new Set(value));
}
/** A template may cover one or several of the selected programs, never an unselected program. */
export function programTemplateMatches(template: Pick<MessageTemplate,"brandId"|"programs"|"channel">, brandId: string | null, programs: string[], channel: CampaignChannel) {
  const tags = template.programs || [];
  return template.channel === channel && (!template.brandId || template.brandId === brandId) && (programs.length ? tags.length > 0 && tags.every(p => programs.includes(p)) : tags.length === 0);
}
export function programDraft(programs: string[], channel: CampaignChannel) {
  const label = programs.length ? programs.join(", ") : "business financing";
  const detail = `Explore ${label} options for your next business opportunity through third-party providers. Eligibility and terms depend on the provider.` + (programs.includes("HELOC") ? " A HELOC is secured by your home; failure to repay may result in foreclosure." : "");
  return {subject:`${label} options from {{brand}}`,message:channel === "sms"
    ? `Hi {{firstName}}, {{brand}} here. ${detail} Reply INFO to discuss, or STOP to opt out.`
    : `Hi {{firstName}},\n\n{{brand}} here. ${detail}\n\nReply if you would like to discuss your options.\n\nUnsubscribe anytime.`};
}
