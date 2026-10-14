/**
 * Campaign / Autopilot send windows (local clock in campaign timezone).
 * Presets: morning 09:00–12:00, afternoon 13:00–17:00, evening 17:00–20:00.
 */

export type SendWindowPreset = "morning" | "afternoon" | "evening" | "custom" | "any";

export type TimeOfDayBucket = "morning" | "afternoon" | "evening" | "night";

export type SendWindow = {
  sendWindowPreset: SendWindowPreset;
  sendWindowStart?: string | null;
  sendWindowEnd?: string | null;
  timezone?: string | null;
};

export const SEND_WINDOW_PRESETS: Record<
  Exclude<SendWindowPreset, "custom" | "any">,
  { start: string; end: string; label: string }
> = {
  morning: { start: "09:00", end: "12:00", label: "Morning (9am–12pm)" },
  afternoon: { start: "13:00", end: "17:00", label: "Afternoon (1pm–5pm)" },
  evening: { start: "17:00", end: "20:00", label: "Evening (5pm–8pm)" },
};

export const DEFAULT_TIMEZONE = "America/New_York";

export function resolveWindowHours(window: SendWindow): {
  start: string;
  end: string;
} | null {
  if (window.sendWindowPreset === "any") return null;
  if (window.sendWindowPreset === "custom") {
    const start = window.sendWindowStart || "09:00";
    const end = window.sendWindowEnd || "17:00";
    return { start, end };
  }
  const preset = SEND_WINDOW_PRESETS[window.sendWindowPreset];
  return { start: preset.start, end: preset.end };
}

/** Minutes from local midnight for "HH:mm" (24h). */
export function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 0;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + min;
}

export function localMinutesNow(
  timezone: string = DEFAULT_TIMEZONE,
  at: Date = new Date(),
): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");
  // Intl may return 24 for midnight in some environments
  const h = hour === 24 ? 0 : hour;
  return h * 60 + minute;
}

export function isWithinSendWindow(
  window: SendWindow,
  at: Date = new Date(),
): boolean {
  const hours = resolveWindowHours(window);
  if (!hours) return true;
  const tz = window.timezone || DEFAULT_TIMEZONE;
  const now = localMinutesNow(tz, at);
  const start = hhmmToMinutes(hours.start);
  const end = hhmmToMinutes(hours.end);
  if (start === end) return true;
  if (start < end) return now >= start && now < end;
  // overnight window e.g. 22:00–06:00
  return now >= start || now < end;
}

export function sendWindowLabel(window: SendWindow): string {
  if (window.sendWindowPreset === "any") return "Any time";
  if (window.sendWindowPreset === "custom") {
    return `Custom ${window.sendWindowStart || "?"}–${window.sendWindowEnd || "?"}`;
  }
  return SEND_WINDOW_PRESETS[window.sendWindowPreset].label;
}

export function timeOfDayBucket(
  iso: string,
  timezone: string = DEFAULT_TIMEZONE,
): TimeOfDayBucket {
  const mins = localMinutesNow(timezone, new Date(iso));
  if (mins >= 5 * 60 && mins < 12 * 60) return "morning";
  if (mins >= 12 * 60 && mins < 17 * 60) return "afternoon";
  if (mins >= 17 * 60 && mins < 21 * 60) return "evening";
  return "night";
}

export function normalizeSendWindow(
  input?: Partial<SendWindow> | null,
): Required<Pick<SendWindow, "sendWindowPreset">> & {
  sendWindowStart: string | null;
  sendWindowEnd: string | null;
  timezone: string;
} {
  const preset = (input?.sendWindowPreset || "any") as SendWindowPreset;
  const valid: SendWindowPreset[] = [
    "morning",
    "afternoon",
    "evening",
    "custom",
    "any",
  ];
  const sendWindowPreset = valid.includes(preset) ? preset : "any";
  let start = input?.sendWindowStart ?? null;
  let end = input?.sendWindowEnd ?? null;
  if (sendWindowPreset !== "custom" && sendWindowPreset !== "any") {
    start = SEND_WINDOW_PRESETS[sendWindowPreset].start;
    end = SEND_WINDOW_PRESETS[sendWindowPreset].end;
  }
  return {
    sendWindowPreset,
    sendWindowStart: start,
    sendWindowEnd: end,
    timezone: input?.timezone || DEFAULT_TIMEZONE,
  };
}
