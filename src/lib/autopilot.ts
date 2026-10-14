import type { Brand, EntityDailyQuota, RotationConfig } from "@/lib/types";

export const DEFAULT_DAILY_EMAIL = 20_000;
export const DEFAULT_DAILY_SMS = 20_000;

export type AutopilotRunResult = {
  ranAt: string;
  nextRunAt: string;
  legs: Array<{
    entityId: string;
    channel: "sms" | "email";
    campaignId: string;
    sent: number;
    volume: number;
  }>;
};

export function defaultQuotas(entityIds: string[]): EntityDailyQuota[] {
  return entityIds.map((entityId) => ({
    entityId,
    dailyEmailVolume: DEFAULT_DAILY_EMAIL,
    dailySmsVolume: DEFAULT_DAILY_SMS,
    enabled: true,
    sendWindowPreset: "morning" as const,
    timezone: "America/New_York",
  }));
}

export function normalizeRotation(
  rotation: Partial<RotationConfig> & {
    entityOrder: string[];
    mode?: RotationConfig["mode"];
    notes?: string;
  },
  brands: Brand[],
): RotationConfig {
  const order =
    rotation.entityOrder.length > 0
      ? rotation.entityOrder
      : brands.map((b) => b.id);
  const existing = new Map(
    (rotation.quotas || []).map((q) => [q.entityId, q]),
  );
  const quotas = order.map((entityId) => {
    const prev = existing.get(entityId);
    return {
      entityId,
      dailyEmailVolume: prev?.dailyEmailVolume ?? DEFAULT_DAILY_EMAIL,
      dailySmsVolume: prev?.dailySmsVolume ?? DEFAULT_DAILY_SMS,
      enabled: prev?.enabled ?? true,
      sendWindowPreset: prev?.sendWindowPreset ?? ("morning" as const),
      sendWindowStart: prev?.sendWindowStart ?? null,
      sendWindowEnd: prev?.sendWindowEnd ?? null,
      timezone: prev?.timezone ?? "America/New_York",
    };
  });

  return {
    mode: rotation.mode || "round_robin",
    entityOrder: order,
    notes:
      rotation.notes ||
      "Ferris-wheel: shared pool rotates through each entity daily. Campaigns never cross brands.",
    autopilotEnabled: rotation.autopilotEnabled ?? false,
    quotas,
    lastRunAt: rotation.lastRunAt,
    nextRunAt: rotation.nextRunAt,
    poolCursor: Math.max(0, Math.floor(rotation.poolCursor ?? 0)),
  };
}

export function entityOfferCopy(brand: Brand): {
  sms: string;
  emailSubject: string;
  emailBody: string;
} {
  const name = brand.shortName;
  return {
    sms: `Hi {{firstName}}, ${name} here — ${brand.focus}. Reply YES for options, or STOP to opt out.`,
    emailSubject: `${name}: options for your business`,
    emailBody: `Hi {{firstName}},\n\nThis is ${brand.name}. ${brand.focus}.\n\nReply if you want details, or unsubscribe anytime.\n\n— ${name}`,
  };
}

export function tomorrowIso(from = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(14, 0, 0, 0);
  return d.toISOString();
}
