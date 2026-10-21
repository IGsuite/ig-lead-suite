import type { Campaign } from "@/lib/types";
import { calendarDisposition } from "@/lib/marketing-calendar";

import type { CampaignListStatus } from "@/lib/campaign-status-filters";
export type CampaignStatusEntry = {
  campaignId: string; runCampaignId: string; date: string; startTime: string; endTime: string;
  timezone: string; status: string; error?: string | null; snapshot: { volume?: number };
};
type CampaignState = Pick<Campaign, "id"> & { status: string };

/** Read-only display state. A calendar parent is a blueprint, not an unscheduled draft. */
export function campaignListStatus(campaign: CampaignState, entries: CampaignStatusEntry[], enabled: boolean, runs: ReadonlyMap<string, CampaignState>, now = new Date()): CampaignListStatus {
  const own = entries.filter(e => e.campaignId === campaign.id);
  if (own.length) {
    const ready = own.filter(e => ["approved", "started"].includes(e.status) && calendarDisposition(e, true, now) !== "expired");
    if (enabled && ready.some(e => calendarDisposition(e, true, now) === "due" && runs.get(e.runCampaignId)?.status === "sending"))
      return { group: "active", status: "sending", detail: "Calendar run in progress" };
    if (enabled && ready.length) {
      const next = [...ready].sort((a,b) => (a.date+a.startTime).localeCompare(b.date+b.startTime))[0];
      if (next.error) return { group: "pending", status: "pending", detail: `Needs attention: ${next.error}` };
      return { group: "pending", status: "scheduled", detail: `Next: ${next.date} at ${next.startTime} ${next.timezone} · ${next.snapshot.volume || 0} contacts` };
    }
    if (!enabled && ready.length) return { group: "inactive", status: "paused", detail: ready.some(e=>e.error) ? `Calendar is off · needs attention: ${ready.find(e=>e.error)!.error}` : "Approved dates saved · calendar is off" };
    if (own.every(e => ["completed", "skipped"].includes(e.status)) && own.some(e => e.status === "completed"))
      return { group: "completed", status: "completed", detail: "Calendar plan finished" };
    if (own.some(e => e.status === "draft" && calendarDisposition(e, false, now) !== "expired"))
      return { group: "inactive", status: "draft", detail: "Calendar dates await approval" };
    return { group: "inactive", status: "paused", detail: "No future approved calendar dates" };
  }
  if (campaign.status === "completed" || campaign.status === "cancelled") return { group: campaign.status, status: campaign.status };
  const dated = entries.find(e => e.runCampaignId === campaign.id);
  if (dated?.error && enabled && calendarDisposition(dated,true,now)!=="expired" && ["approved","started"].includes(dated.status))
    return { group:"pending",status:"pending",detail:`Needs attention: ${dated.error}` };
  if (dated && (!enabled || calendarDisposition(dated, true, now) === "expired" || !["approved", "started"].includes(dated.status)))
    return { group: "inactive", status: "paused", detail: "Calendar date is paused, expired, or calendar is off" };
  if (campaign.status === "sending") return { group: "active", status: "sending" };
  if (campaign.status === "scheduled") return { group: "pending", status: "scheduled", detail: "Waiting for the sending window" };
  return { group: "inactive", status: campaign.status };
}
