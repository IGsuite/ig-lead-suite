import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { assertEntityAccess, canAccessEntity } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import {
  createSocialCampaign,
  deleteSocialCampaign,
  getData,
  updateSocialCampaign,
  upsertSocialConnection,
} from "@/lib/store";
import type {
  SocialCampaignStatus,
  SocialConnectionStatus,
  SocialPlatform,
} from "@/lib/types";

type SocialBody = {
  action?: string;
  id?: string;
  entityId?: string;
  platform?: SocialPlatform;
  name?: string;
  status?: SocialCampaignStatus;
  objective?: string;
  budgetCents?: number | null;
  dailyBudgetCents?: number | null;
  targetingNotes?: string;
  primaryText?: string;
  cta?: string;
  landingUrl?: string;
  notes?: string;
  creativeAssetId?: string | null;
  creativeTemplateId?: string | null;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  impressions?: number;
  clicks?: number;
  leads?: number;
  spendCents?: number;
  // connection fields
  connectionStatus?: SocialConnectionStatus;
  adAccountId?: string;
  pixelOrEventsId?: string;
  accessTokenNote?: string;
  connectionNotes?: string;
};

function dollarsToCents(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  const data = await getData();
  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get("entityId");
  const platform = searchParams.get("platform") as SocialPlatform | null;

  let campaigns = (data.socialCampaigns || []).filter((c) =>
    canAccessEntity(session, c.entityId),
  );
  let connections = (data.socialConnections || []).filter((c) =>
    canAccessEntity(session, c.entityId),
  );

  if (entityId) {
    const gate = assertEntityAccess(session, entityId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    campaigns = campaigns.filter((c) => c.entityId === entityId);
    connections = connections.filter((c) => c.entityId === entityId);
  }
  if (platform === "meta" || platform === "tiktok") {
    campaigns = campaigns.filter((c) => c.platform === platform);
    connections = connections.filter((c) => c.platform === platform);
  }

  return NextResponse.json({
    campaigns,
    connections,
    envHints: {
      metaTokenConfigured: Boolean(process.env.META_ACCESS_TOKEN?.trim()),
      tiktokTokenConfigured: Boolean(process.env.TIKTOK_ACCESS_TOKEN?.trim()),
    },
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  const body = (await request.json()) as SocialBody & {
    budgetDollars?: number | string | null;
    dailyBudgetDollars?: number | string | null;
    spendDollars?: number | string | null;
  };

  if (body.action === "upsert_connection") {
    if (!body.entityId || !body.platform) {
      return NextResponse.json(
        { error: "entityId and platform are required" },
        { status: 400 },
      );
    }
    const gate = assertEntityAccess(session, body.entityId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const connection = await upsertSocialConnection({
      entityId: body.entityId,
      platform: body.platform,
      status: body.connectionStatus || "not_connected",
      adAccountId: body.adAccountId,
      pixelOrEventsId: body.pixelOrEventsId,
      accessTokenNote: body.accessTokenNote,
      notes: body.connectionNotes ?? body.notes,
    });
    return NextResponse.json(connection);
  }

  if (body.action === "delete" && body.id) {
    const data = await getData();
    const existing = (data.socialCampaigns || []).find((c) => c.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const gate = assertEntityAccess(session, existing.entityId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const ok = await deleteSocialCampaign(body.id);
    if (!ok) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "update" && body.id) {
    const data = await getData();
    const existing = (data.socialCampaigns || []).find((c) => c.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const gate = assertEntityAccess(session, existing.entityId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    if (body.entityId && body.entityId !== existing.entityId) {
      const moveGate = assertEntityAccess(session, body.entityId);
      if (!moveGate.ok) {
        return NextResponse.json(
          { error: moveGate.error },
          { status: moveGate.status },
        );
      }
    }

    const budgetCents =
      body.budgetCents !== undefined
        ? body.budgetCents
        : dollarsToCents(body.budgetDollars);
    const dailyBudgetCents =
      body.dailyBudgetCents !== undefined
        ? body.dailyBudgetCents
        : dollarsToCents(body.dailyBudgetDollars);
    const spendCents =
      body.spendCents !== undefined
        ? body.spendCents
        : dollarsToCents(body.spendDollars);

    const updated = await updateSocialCampaign(body.id, {
      entityId: body.entityId,
      platform: body.platform,
      name: body.name,
      status: body.status,
      objective: body.objective,
      budgetCents,
      dailyBudgetCents,
      targetingNotes: body.targetingNotes,
      primaryText: body.primaryText,
      cta: body.cta,
      landingUrl: body.landingUrl,
      notes: body.notes,
      creativeAssetId: body.creativeAssetId,
      creativeTemplateId: body.creativeTemplateId,
      scheduleStart: body.scheduleStart,
      scheduleEnd: body.scheduleEnd,
      impressions: body.impressions,
      clicks: body.clicks,
      leads: body.leads,
      spendCents: spendCents === undefined ? undefined : spendCents ?? 0,
    });
    if (!updated) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  if (!body.entityId || !body.platform || !body.name?.trim()) {
    return NextResponse.json(
      { error: "entityId, platform, and name are required" },
      { status: 400 },
    );
  }

  const gate = assertEntityAccess(session, body.entityId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const budgetCents =
    body.budgetCents !== undefined
      ? body.budgetCents
      : dollarsToCents(body.budgetDollars);
  const dailyBudgetCents =
    body.dailyBudgetCents !== undefined
      ? body.dailyBudgetCents
      : dollarsToCents(body.dailyBudgetDollars);

  const campaign = await createSocialCampaign({
    entityId: body.entityId,
    platform: body.platform,
    name: body.name.trim(),
    status: body.status || "draft",
    objective: body.objective?.trim() || "",
    budgetCents: budgetCents ?? null,
    dailyBudgetCents: dailyBudgetCents ?? null,
    targetingNotes: body.targetingNotes,
    primaryText: body.primaryText,
    cta: body.cta,
    landingUrl: body.landingUrl,
    notes: body.notes,
    creativeAssetId: body.creativeAssetId ?? null,
    creativeTemplateId: body.creativeTemplateId ?? null,
    scheduleStart: body.scheduleStart ?? null,
    scheduleEnd: body.scheduleEnd ?? null,
    impressions: body.impressions ?? 0,
    clicks: body.clicks ?? 0,
    leads: body.leads ?? 0,
    spendCents: body.spendCents ?? 0,
  });

  return NextResponse.json(campaign);
}
