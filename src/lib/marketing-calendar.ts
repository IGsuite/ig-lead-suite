import { z } from "zod";
import { programTemplateMatches } from "@/lib/programs";
import type { Campaign, MessageTemplate } from "@/lib/types";

export type CalendarEntry = {
  id: string; brandId: string; product: string; date: string;
  startTime: string; endTime: string; timezone: string; channel: string;
  campaignId: string; templateId: string | null; snapshot: Campaign;
  status: string; runCampaignId: string; error: string | null;
};
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(s + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Invalid calendar date");
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const calendarInput = z.object({
  brandId: z.string().min(1), product: z.string().trim().min(1).max(1000),
  campaignId: z.string().min(1), templateId: z.string().optional(),
  startDate: date, endDate: date,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: time, endTime: time,
  timezone: z.string().refine(s => { try { new Intl.DateTimeFormat("en", {timeZone:s}); return true; } catch { return false; } }, "Invalid timezone"),
  volume: z.number().int().min(1).max(20000),
  throttlePerHour: z.number().int().min(1).max(20000),
}).refine(v => v.startTime < v.endTime, "End time must be later on the same day")
  .refine(v => v.startTime >= "09:00" && v.endTime <= "20:00", "Choose hours between 09:00 and 20:00");

export function calendarClock(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: timezone, year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return {date:`${part("year")}-${part("month")}-${part("day")}`,time:`${part("hour")}:${part("minute")}`};
}

export function calendarDates(input: z.infer<typeof calendarInput>, now = new Date()) {
  const today = calendarClock(input.timezone, now).date;
  const horizon = new Date(today + "T12:00:00Z"); horizon.setUTCFullYear(horizon.getUTCFullYear() + 1);
  if (input.startDate < today || input.endDate < input.startDate || input.endDate > horizon.toISOString().slice(0,10)) throw new Error("Choose dates from today through the next 12 months");
  const dates: string[] = [];
  for (const d = new Date(input.startDate + "T12:00:00Z"); d.toISOString().slice(0,10) <= input.endDate; d.setUTCDate(d.getUTCDate()+1)) {
    if (input.weekdays.includes(d.getUTCDay())) dates.push(d.toISOString().slice(0,10));
  }
  if (!dates.length) throw new Error("No selected weekdays fall in this date range");
  return dates;
}

export function calendarSnapshot(campaign: Campaign, template: MessageTemplate | undefined, input: z.infer<typeof calendarInput>): Campaign {
  if (campaign.brandId !== input.brandId) throw new Error("Campaign belongs to another company");
  if (campaign.programs?.length && campaign.programs.join(" + ") !== input.product) throw new Error("Use the campaign’s selected funding programs");
  if (template && !programTemplateMatches(template,campaign.brandId,campaign.programs || [],campaign.channel)) throw new Error("Choose a template for these funding programs");
  if (template && ((template.brandId && template.brandId !== input.brandId) || template.channel !== campaign.channel)) throw new Error("Choose a template for this company and channel");
  return {...campaign, subject: template ? template.subject : campaign.subject,
    message: template ? template.body : campaign.message,
    // An explicitly selected template replaces the full body, including any old HTML/image override.
    htmlMessage: template ? (/<(?:html|table|div|p)\b/i.test(template.body) ? template.body : null) : campaign.htmlMessage,
    imageUrl: template ? null : campaign.imageUrl, imageAlt: template ? null : campaign.imageAlt,
    mode:"auto", volume:input.volume, throttlePerHour:input.throttlePerHour,
    sendWindowPreset:"custom",sendWindowStart:input.startTime,sendWindowEnd:input.endTime,timezone:input.timezone,
    status:"draft",sentCount:0,replyCount:0,optOutCount:0,bounceCount:0,startedAt:undefined};
}

/** Date and local-clock checks handle DST without guessing a UTC offset. Late days never catch up. */
export function calendarDisposition(entry: Pick<CalendarEntry,"date"|"startTime"|"endTime"|"timezone"|"status">, enabled: boolean, now = new Date()) {
  const clock = calendarClock(entry.timezone, now);
  if (clock.date > entry.date || (clock.date === entry.date && clock.time >= entry.endTime)) return "expired";
  if (!enabled || !["approved","started"].includes(entry.status)) return "paused";
  if (clock.date < entry.date || clock.time < entry.startTime) return "future";
  return "due";
}
