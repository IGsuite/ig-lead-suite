import { NextResponse } from "next/server";
import { assertEntityAccess } from "@/lib/acl";
import { campaignMessageResults } from "@/lib/analytics";
import { getSession } from "@/lib/auth";
import {
  generateCreativeDrafts,
  resolveCreativeAiMode,
  type AssistMode,
  type CreativeDraft,
  type IterateAction,
  type LibraryExample,
  type WinnerExample,
} from "@/lib/creative-ai";
import { getData } from "@/lib/store";
import type { CampaignChannel, MessageTemplate } from "@/lib/types";

const ASSIST_MODES: AssistMode[] = ["create", "improve", "winners", "tips"];
const ITERATE_ACTIONS: IterateAction[] = [
  "shorter",
  "stronger_cta",
  "softer",
  "more_variants",
];

function recentLibraryExamples(
  templates: MessageTemplate[],
  channel: CampaignChannel,
  brandId: string | null,
  limit = 5,
): LibraryExample[] {
  return templates
    .filter((t) => {
      if (t.channel !== channel) return false;
      // Entity-first: only that company's library (Shared = brandId null)
      if (brandId) return t.brandId === brandId;
      return t.brandId === null;
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, limit)
    .map((t) => ({
      name: t.name,
      subject: t.subject,
      body: t.body,
    }));
}

function topWinnerExamples(
  data: Awaited<ReturnType<typeof getData>>,
  channel: CampaignChannel,
  brandId: string | null,
  limit = 3,
): WinnerExample[] {
  const scope = brandId || "all";
  return campaignMessageResults(data, scope, channel)
    .filter((m) => m.sent > 0 || m.replies > 0)
    .slice(0, limit)
    .map((m) => ({
      name: m.name,
      subject: m.subject,
      body: m.message,
      interestedRate: m.interestedRate,
      replyRate: m.replyRate,
    }));
}

export async function GET() {
  const resolved = resolveCreativeAiMode();
  return NextResponse.json({
    mode: resolved.mode,
    provider: resolved.provider,
    modelId: resolved.modelId,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  const body = (await request.json()) as {
    channel?: CampaignChannel;
    brief?: string;
    offer?: string;
    tone?: string;
    cta?: string;
    brandId?: string | null;
    count?: number;
    assistMode?: AssistMode;
    iterate?: IterateAction;
    baseDraft?: CreativeDraft;
    templateId?: string | null;
    includeLibrary?: boolean;
    includeWinners?: boolean;
  };

  if (!body.channel || (body.channel !== "sms" && body.channel !== "email")) {
    return NextResponse.json(
      { error: "channel must be sms or email" },
      { status: 400 },
    );
  }

  const assistMode: AssistMode = ASSIST_MODES.includes(
    body.assistMode as AssistMode,
  )
    ? (body.assistMode as AssistMode)
    : "create";

  const iterate = ITERATE_ACTIONS.includes(body.iterate as IterateAction)
    ? (body.iterate as IterateAction)
    : undefined;

  const brandId = body.brandId ?? null;
  if (brandId) {
    const gate = assertEntityAccess(session, brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
  }

  const data = await getData();
  const brand = brandId
    ? data.brands.find((b) => b.id === brandId) || null
    : null;

  if (brandId && !brand) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  let baseDraft = body.baseDraft;
  if (body.templateId) {
    const tpl = data.messageTemplates.find((t) => t.id === body.templateId);
    if (!tpl) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }
    if (tpl.brandId) {
      const gate = assertEntityAccess(session, tpl.brandId);
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.error },
          { status: gate.status },
        );
      }
    }
    baseDraft = {
      name: tpl.name,
      subject: tpl.subject,
      body: tpl.body,
    };
  }

  if (assistMode === "improve" && !baseDraft && !iterate) {
    return NextResponse.json(
      { error: "Pick a template to improve" },
      { status: 400 },
    );
  }

  if (iterate && !baseDraft) {
    return NextResponse.json(
      { error: "Iterate needs a base draft" },
      { status: 400 },
    );
  }

  const needsBrief =
    assistMode === "create" && !iterate && !baseDraft;
  if (needsBrief && !body.brief?.trim()) {
    return NextResponse.json(
      { error: "A short creative brief is required" },
      { status: 400 },
    );
  }

  const includeLibrary = body.includeLibrary !== false;
  const includeWinners =
    body.includeWinners !== false &&
    (assistMode === "winners" ||
      assistMode === "create" ||
      assistMode === "improve" ||
      assistMode === "tips");

  const libraryExamples = includeLibrary
    ? recentLibraryExamples(data.messageTemplates, body.channel, brandId)
    : [];
  const winnerExamples = includeWinners
    ? topWinnerExamples(data, body.channel, brandId)
    : [];

  const result = await generateCreativeDrafts({
    channel: body.channel,
    brief: body.brief?.trim() || "",
    offer: body.offer?.trim(),
    tone: body.tone?.trim(),
    cta: body.cta?.trim(),
    brand,
    count: body.count ?? 3,
    assistMode,
    iterate,
    baseDraft,
    libraryExamples,
    winnerExamples,
  });

  return NextResponse.json({
    ...result,
    context: {
      libraryCount: libraryExamples.length,
      winnerCount: winnerExamples.length,
    },
  });
}
