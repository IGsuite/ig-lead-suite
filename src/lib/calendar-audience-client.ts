import type { Campaign } from "@/lib/types";

/** Parent blueprints run through dated calendar entries, never a direct Launch. */
export function calendarOnly(campaign:Pick<Campaign,"id"|"mode">) {
  return campaign.mode==="auto"&&!campaign.id.startsWith("camp-calendar-")&&!campaign.id.startsWith("camp-auto-");
}
