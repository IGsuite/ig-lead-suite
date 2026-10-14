import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Brand, CampaignChannel } from "@/lib/types";

export type AssistMode = "create" | "improve" | "winners" | "tips";
export type IterateAction =
  | "shorter"
  | "stronger_cta"
  | "softer"
  | "more_variants";

export type CreativeDraft = {
  name: string;
  subject?: string;
  body: string;
};

export type LibraryExample = {
  name: string;
  subject?: string;
  body: string;
};

export type WinnerExample = {
  name: string;
  subject?: string;
  body: string;
  interestedRate?: number | null;
  replyRate?: number | null;
};

export type CreativeGenerateInput = {
  channel: CampaignChannel;
  brief: string;
  offer?: string;
  tone?: string;
  cta?: string;
  brand: Brand | null;
  count?: number;
  assistMode?: AssistMode;
  iterate?: IterateAction;
  baseDraft?: CreativeDraft;
  libraryExamples?: LibraryExample[];
  winnerExamples?: WinnerExample[];
};

export type CreativeGenerateResult = {
  mode: "live" | "demo";
  model: string | null;
  notice?: string;
  variations: CreativeDraft[];
  tips?: string[];
};

const draftSchema = z.object({
  variations: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        subject: z.string().max(120).optional(),
        body: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(3),
});

const tipsSchema = z.object({
  tips: z.array(z.string().min(1).max(280)).min(3).max(6),
});

function googleApiKey(): string | undefined {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    undefined
  );
}

function gatewayConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim(),
  );
}

export function resolveCreativeAiMode(): {
  mode: "live" | "demo";
  provider: "gateway" | "google" | "none";
  modelId: string | null;
} {
  if (gatewayConfigured()) {
    return {
      mode: "live",
      provider: "gateway",
      modelId: "google/gemini-3.5-flash",
    };
  }
  if (googleApiKey()) {
    return {
      mode: "live",
      provider: "google",
      modelId: "gemini-3.5-flash",
    };
  }
  return { mode: "demo", provider: "none", modelId: null };
}

function complianceSystemPrompt(channel: CampaignChannel): string {
  return [
    "You are a marketing creative coach for U.S. small-business financing / marketing agencies.",
    "Help writers move faster: remix proven angles, tighten CTAs, and stay compliance-safe.",
    "Compliance rules (mandatory):",
    "- Never guarantee loan approval, funding amounts, rates, or timelines.",
    "- Avoid phrases like 'guaranteed funding', 'pre-approved', 'you are approved', 'instant cash'.",
    "- Frame offers as possible options subject to qualification / underwriting.",
    "- Be clear this is a marketing outreach, not a credit decision.",
    "- Use tokens exactly as {{firstName}} and {{brand}} where personalization helps.",
    channel === "sms"
      ? "- SMS: keep under ~320 characters when possible; end with a clear reply CTA and include 'STOP to opt out'."
      : "- Email: short body (3–6 short paragraphs max); include a soft unsubscribe note; subject must not overpromise.",
    "Return only the structured output requested.",
  ].join("\n");
}

function iterateInstruction(action: IterateAction): string {
  switch (action) {
    case "shorter":
      return "Make each variation shorter and punchier while keeping the core offer and compliance language.";
    case "stronger_cta":
      return "Strengthen the call-to-action: clearer ask, easier reply path, still soft on promises.";
    case "softer":
      return "Make copy softer and more compliance-safe: less urgency, more qualification language, no pressure.";
    case "more_variants":
      return "Produce fresh alternate angles from the base draft — different hooks, same compliance rules.";
  }
}

function formatExamples(
  label: string,
  examples: Array<{
    name: string;
    subject?: string;
    body: string;
    interestedRate?: number | null;
    replyRate?: number | null;
  }>,
): string | null {
  if (!examples.length) return null;
  const lines = examples.map((ex, i) => {
    const stats =
      ex.interestedRate != null || ex.replyRate != null
        ? ` [interested ${ex.interestedRate ?? "—"}% · reply ${ex.replyRate ?? "—"}%]`
        : "";
    const subject = ex.subject ? ` Subject: ${ex.subject}.` : "";
    return `${i + 1}. ${ex.name}${stats}.${subject} Body: ${ex.body}`;
  });
  return `${label}:\n${lines.join("\n")}`;
}

function brandLine(brand: Brand | null): string {
  return brand
    ? `Entity: ${brand.name} (${brand.shortName}). Focus: ${brand.focus}. Programs: ${brand.programs.slice(0, 4).join(", ")}.`
    : "Entity: shared library (generic working-capital / business-funding tone; use {{brand}} token).";
}

function userPrompt(input: CreativeGenerateInput, count: number): string {
  const assistMode = input.assistMode || "create";
  const parts: Array<string | null> = [
    `Channel: ${input.channel === "sms" ? "SMS text" : "cold email"}.`,
    brandLine(input.brand),
    input.offer ? `Offer / angle: ${input.offer}` : null,
    input.tone ? `Tone: ${input.tone}` : null,
    input.cta ? `Desired CTA: ${input.cta}` : null,
  ];

  if (input.iterate && input.baseDraft) {
    parts.push(
      `Iterate on this base draft with instruction: ${iterateInstruction(input.iterate)}`,
      `Base name: ${input.baseDraft.name}`,
      input.baseDraft.subject
        ? `Base subject: ${input.baseDraft.subject}`
        : null,
      `Base body:\n${input.baseDraft.body}`,
      input.brief.trim()
        ? `Additional brief / notes: ${input.brief.trim()}`
        : null,
    );
  } else if (assistMode === "improve" && input.baseDraft) {
    parts.push(
      "Mode: improve an existing creative. Keep the useful structure; rewrite for clarity, CTA, and compliance.",
      `Template name: ${input.baseDraft.name}`,
      input.baseDraft.subject
        ? `Current subject: ${input.baseDraft.subject}`
        : null,
      `Current body:\n${input.baseDraft.body}`,
      input.brief.trim()
        ? `Improvement direction: ${input.brief.trim()}`
        : "Improvement direction: tighten and modernize while staying on-brand.",
    );
  } else if (assistMode === "winners") {
    parts.push(
      "Mode: suggest new creatives inspired by past winners / similar library copy. Remix patterns — do not copy verbatim.",
      input.brief.trim()
        ? `Creative brief: ${input.brief.trim()}`
        : "Creative brief: new variants in the spirit of what has worked before.",
    );
  } else {
    parts.push(`Creative brief: ${input.brief.trim() || "Outbound opener"}`);
  }

  parts.push(
    formatExamples(
      "Recent templates from this entity/channel (remix similar patterns)",
      input.libraryExamples || [],
    ),
    formatExamples(
      "Top-performing campaign messages (use as inspiration, not verbatim)",
      input.winnerExamples || [],
    ),
    `Generate ${count} distinct variations.`,
    input.channel === "email"
      ? "Each variation needs: name (internal label), subject, body."
      : "Each variation needs: name (internal label), body (no subject).",
  );

  return parts.filter(Boolean).join("\n");
}

function tipsUserPrompt(input: CreativeGenerateInput): string {
  return [
    `Give 4–6 short coaching tips for writing better ${input.channel === "sms" ? "SMS" : "email"} ads.`,
    brandLine(input.brand),
    "Audience: U.S. SMB owners contacted about working capital / financing options.",
    "Keep each tip one or two sentences. Cover structure, CTA, compliance, personalization, and testing.",
    formatExamples(
      "Recent templates for context",
      input.libraryExamples || [],
    ),
    formatExamples(
      "What has performed relatively well",
      input.winnerExamples || [],
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

export function mockCreativeTips(input: CreativeGenerateInput): string[] {
  const entity = input.brand?.shortName || "your entity";
  if (input.channel === "sms") {
    return [
      `Lead with {{firstName}} + ${entity} in the first ~40 characters so the text feels personal, not blasty.`,
      "Ask for one clear reply (YES / OPTIONS) — one CTA beats two competing asks on SMS.",
      "Always keep STOP language; never imply approval, rates, or funding timelines.",
      "Remix a past opener that got replies: change the hook, keep the compliant CTA pattern.",
      "Aim under ~320 characters; cut filler before you cut the offer or opt-out line.",
      "Test one variable at a time (hook vs CTA) against a similar list slice.",
    ];
  }
  return [
    `Subject lines for ${entity}: curiosity + soft benefit — never “approved” or “guaranteed cash”.`,
    "Open email with relevance in one sentence, then the offer framed as options if they qualify.",
    "End with a low-friction reply CTA and a soft unsubscribe note.",
    "Steal structure from winners (hook → proof of help → soft ask), not their exact wording.",
    "Keep body scannable: short paragraphs, one primary CTA, no dense legal walls.",
    "A/B subject first; then test CTA wording while holding the body steady.",
  ];
}

export function mockCreativeDrafts(
  input: CreativeGenerateInput,
  count: number,
): CreativeDraft[] {
  const brandToken = "{{brand}}";
  const short =
    input.brand?.shortName || brandToken.replace(/[{}]/g, "") || "our team";
  const offer =
    input.offer?.trim() ||
    input.brand?.focus ||
    "working capital options for qualified businesses";
  const cta =
    input.cta?.trim() ||
    (input.channel === "sms"
      ? "Reply YES for options"
      : "Reply if you want a quick look");
  const tone = input.tone?.trim() || "professional and helpful";
  const libraryHook = input.libraryExamples?.[0]?.body?.slice(0, 60);
  const winnerHook = input.winnerExamples?.[0]?.body?.slice(0, 60);

  if (input.iterate && input.baseDraft) {
    const base = input.baseDraft;
    const body = base.body.replace(/\s+/g, " ").trim();
    const shorterSms = (() => {
      const core = body
        .replace(/\s*STOP to opt out\.?/i, "")
        .replace(/\s*Msg & data rates may apply\.?/i, "")
        .trim()
        .slice(0, 180)
        .replace(/\s+\S*$/, "")
        .trim();
      return `${core} STOP to opt out.`;
    })();
    const strongerSms = (() => {
      const core = body
        .replace(/\s*STOP to opt out\.?/i, "")
        .replace(/\s*Reply[^.!]*/i, "")
        .trim()
        .replace(/[.,;:\s]+$/, "");
      return `${core}. ${cta}. STOP to opt out.`;
    })();
    const iterated: CreativeDraft[] = [
      {
        name: `${base.name} · shorter`,
        subject:
          input.channel === "email"
            ? (base.subject || "").replace(/guaranteed|approved/gi, "options")
            : undefined,
        body:
          input.channel === "sms"
            ? shorterSms
            : body
                .split(/\n\n+/)
                .slice(0, 3)
                .join("\n\n"),
      },
      {
        name: `${base.name} · stronger CTA`,
        subject:
          input.channel === "email"
            ? base.subject || `{{firstName}}, options from ${brandToken}`
            : undefined,
        body:
          input.channel === "sms"
            ? strongerSms
            : `${body.replace(/\n\nUnsubscribe anytime\.?/i, "").trim()}\n\n${cta}.\n\nUnsubscribe anytime.`,
      },
      {
        name: `${base.name} · softer`,
        subject:
          input.channel === "email"
            ? `When you're ready — options from ${brandToken}`
            : undefined,
        body:
          input.channel === "sms"
            ? `Hi {{firstName}}, ${brandToken} — ${offer} may be available if you qualify. Reply only if useful, or STOP to opt out.`
            : `Hi {{firstName}},\n\nNo pressure — ${brandToken} can share ${offer} for businesses that qualify. This is outreach, not an approval.\n\n${cta}.\n\nUnsubscribe anytime.`,
      },
    ];

    const ordered =
      input.iterate === "stronger_cta"
        ? [iterated[1], iterated[0], iterated[2]]
        : input.iterate === "softer"
          ? [iterated[2], iterated[0], iterated[1]]
          : iterated;
    return ordered.slice(0, Math.min(3, Math.max(1, count)));
  }

  if (input.assistMode === "improve" && input.baseDraft) {
    const base = input.baseDraft;
    return [
      {
        name: `${base.name} (improved)`,
        subject:
          input.channel === "email"
            ? base.subject || `{{firstName}}, a note from ${brandToken}`
            : undefined,
        body:
          input.channel === "sms"
            ? `Hi {{firstName}}, ${brandToken} — ${offer}. ${cta}. STOP to opt out.`
            : `Hi {{firstName}},\n\n${brandToken} here. ${offer} may be available if you qualify — not a loan offer or approval.\n\n${cta}.\n\nUnsubscribe anytime.`,
      },
      {
        name: `${base.name} (alt hook)`,
        subject:
          input.channel === "email"
            ? `Quick question for {{firstName}}`
            : undefined,
        body:
          input.channel === "sms"
            ? `{{firstName}}, exploring capital options with ${brandToken}? ${cta}. STOP to opt out.`
            : `Hi {{firstName}},\n\nKeeping this ${tone}: we help businesses review ${offer} with lenders — no guaranteed funding.\n\n${cta}.\n\nUnsubscribe anytime.`,
      },
      {
        name: `${base.name} (compliance pass)`,
        subject:
          input.channel === "email"
            ? `${brandToken}: options if you qualify`
            : undefined,
        body:
          input.channel === "sms"
            ? `Hi {{firstName}} — ${brandToken}. Options may exist for qualified businesses. ${cta}. STOP to opt out.`
            : `Hi {{firstName}},\n\nReworked for a softer compliance tone. ${brandToken} can walk through ${offer} without promising approval.\n\n${cta}.\n\nUnsubscribe anytime.`,
      },
    ].slice(0, Math.min(3, Math.max(1, count)));
  }

  const inspired =
    winnerHook || libraryHook
      ? ` Inspired by past ${winnerHook ? "winners" : "library"} patterns.`
      : "";

  const base: CreativeDraft[] = [
    {
      name: `${short} — ${input.channel} opener A`,
      subject:
        input.channel === "email"
          ? `{{firstName}}, options from ${brandToken}`
          : undefined,
      body:
        input.channel === "sms"
          ? `Hi {{firstName}}, ${brandToken} here — ${offer}. ${cta}, or STOP to opt out.`
          : `Hi {{firstName}},\n\n${brandToken} here. Based on what we know about small businesses like yours, ${offer} may be available if you qualify.${inspired}\n\n${cta}. This is not a loan offer or approval.\n\nUnsubscribe anytime.`,
    },
    {
      name: `${short} — ${input.channel} opener B`,
      subject:
        input.channel === "email"
          ? `A quick question about capital for {{firstName}}`
          : undefined,
      body:
        input.channel === "sms"
          ? `{{firstName}}, ${brandToken}: exploring ${offer}? ${cta}. Msg & data rates may apply. STOP to opt out.`
          : `Hi {{firstName}},\n\nKeeping this ${tone}: ${brandToken} helps businesses review ${offer} with lenders — no guaranteed funding.\n\n${cta}.\n\nUnsubscribe anytime.`,
    },
    {
      name: `${short} — ${input.channel} soft CTA`,
      subject:
        input.channel === "email"
          ? `${brandToken}: when you're ready to compare options`
          : undefined,
      body:
        input.channel === "sms"
          ? `Hi {{firstName}} — ${brandToken}. ${(input.brief || "Capital options").slice(0, 80)}. ${cta}. STOP to opt out.`
          : `Hi {{firstName}},\n\nBrief we worked from: ${(input.brief || "Outbound capital options").slice(0, 160)}\n\n${brandToken} can walk through ${offer} without promising approval.\n\n${cta}.\n\nUnsubscribe anytime.`,
    },
  ];

  return base.slice(0, Math.min(3, Math.max(1, count)));
}

async function resolveModel(
  resolved: ReturnType<typeof resolveCreativeAiMode>,
) {
  return resolved.provider === "gateway"
    ? resolved.modelId!
    : createGoogleGenerativeAI({ apiKey: googleApiKey() })(
        resolved.modelId as "gemini-3.5-flash",
      );
}

export async function generateCreativeTips(
  input: CreativeGenerateInput,
): Promise<CreativeGenerateResult> {
  const resolved = resolveCreativeAiMode();

  if (resolved.mode === "demo") {
    return {
      mode: "demo",
      model: null,
      notice:
        "Demo tips (no AI key). Add GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or AI_GATEWAY_API_KEY for live coaching.",
      variations: [],
      tips: mockCreativeTips(input),
    };
  }

  try {
    const model = await resolveModel(resolved);
    const { output } = await generateText({
      model,
      output: Output.object({ schema: tipsSchema }),
      system: complianceSystemPrompt(input.channel),
      prompt: tipsUserPrompt(input),
      temperature: 0.6,
    });

    if (!output?.tips?.length) throw new Error("Model returned no tips");

    return {
      mode: "live",
      model: resolved.modelId,
      variations: [],
      tips: output.tips.map((t) => t.trim()).filter(Boolean).slice(0, 6),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tips failed";
    return {
      mode: "demo",
      model: resolved.modelId,
      notice: `Live AI failed (${message}). Showing demo coaching tips instead.`,
      variations: [],
      tips: mockCreativeTips(input),
    };
  }
}

export async function generateCreativeDrafts(
  input: CreativeGenerateInput,
): Promise<CreativeGenerateResult> {
  if (input.assistMode === "tips") {
    return generateCreativeTips(input);
  }

  const count = Math.min(3, Math.max(1, input.count ?? 3));
  const resolved = resolveCreativeAiMode();

  if (resolved.mode === "demo") {
    return {
      mode: "demo",
      model: null,
      notice:
        "Demo drafts (no AI key). Add GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or AI_GATEWAY_API_KEY for live Gemini drafts.",
      variations: mockCreativeDrafts(input, count),
    };
  }

  try {
    const model = await resolveModel(resolved);
    const { output } = await generateText({
      model,
      output: Output.object({ schema: draftSchema }),
      system: complianceSystemPrompt(input.channel),
      prompt: userPrompt(input, count),
      temperature: input.iterate === "more_variants" ? 0.85 : 0.7,
    });

    if (!output?.variations?.length) {
      throw new Error("Model returned no variations");
    }

    const variations = output.variations.slice(0, count).map((v) => ({
      name: v.name.trim(),
      subject:
        input.channel === "email"
          ? (v.subject || "").trim() || undefined
          : undefined,
      body: v.body.trim(),
    }));

    return {
      mode: "live",
      model: resolved.modelId,
      variations,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return {
      mode: "demo",
      model: resolved.modelId,
      notice: `Live AI failed (${message}). Showing compliance-minded demo drafts instead.`,
      variations: mockCreativeDrafts(input, count),
    };
  }
}
