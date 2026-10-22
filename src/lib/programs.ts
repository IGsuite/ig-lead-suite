import type { Brand, CampaignChannel, MessageTemplate } from "@/lib/types";

export function validatePrograms(brand: Pick<Brand,"programs"> | null | undefined, value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30 || value.some(p => typeof p !== "string" || !brand?.programs.includes(p))) throw new Error("Choose programs or services belonging to this company");
  return Array.from(new Set(value));
}
/** A template may cover one or several of the selected programs, never an unselected program. */
export function programTemplateMatches(template: Pick<MessageTemplate,"brandId"|"programs"|"channel">, brandId: string | null, programs: string[], channel: CampaignChannel) {
  const tags = template.programs || [];
  return template.channel === channel && (!template.brandId || template.brandId === brandId) && (programs.length ? tags.length > 0 && tags.every(p => programs.includes(p)) : tags.length === 0);
}
export function isFinancingBrand(brand?: Pick<Brand,"id"> | null): boolean {
  return !brand || ["abstract", "ahava", "takemore", "venture"].includes(brand.id);
}
export function programDraft(programs: string[], channel: CampaignChannel, brand?: Pick<Brand,"id"> | null) {
  if (!isFinancingBrand(brand)) {
    const dental = brand?.id === "imagination-orthodontics";
    const bankable = brand?.id === "bankable-credit";
    const label = programs.length ? programs.join(", ") : dental ? "orthodontic care" : bankable ? "business credit monitoring" : "our services";
    const detail = bankable
      ? `We're preparing Bankable Credit for launch. Learn about our planned ${label} features and join the waitlist for updates. Provider approval and production access are still being prepared.`
      : dental ? `Interested in ${label}? Our team can explain the available care options and help you arrange a consultation.`
      : `Learn more about ${label} and how our team can help.`;
    return {subject: bankable ? `Launch updates from {{brand}}` : `${label} from {{brand}}`,message:channel === "sms"
      ? `Hi {{firstName}}, {{brand}} here. ${detail} Reply INFO to learn more, or STOP to opt out.`
      : `Hi {{firstName}},\n\n{{brand}} here. ${detail}\n\nReply if you'd like more information.\n\nUnsubscribe anytime.`};
  }
  const label = programs.length ? programs.join(", ") : "business financing";
  const detail = `Explore ${label} options for your next business opportunity through third-party providers. Eligibility and terms depend on the provider.` + (programs.includes("HELOC") ? " A HELOC is secured by your home; failure to repay may result in foreclosure." : "");
  return {subject:`${label} options from {{brand}}`,message:channel === "sms"
    ? `Hi {{firstName}}, {{brand}} here. ${detail} Reply INFO to discuss, or STOP to opt out.`
    : `Hi {{firstName}},\n\n{{brand}} here. ${detail}\n\nReply if you would like to discuss your options.\n\nUnsubscribe anytime.`};
}
