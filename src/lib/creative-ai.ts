import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Brand, CampaignChannel } from "@/lib/types";

export type CreativeDraft = {
  name: string;
  subject?: string;
  body: string;
};

export type CreativeGenerateInput = {
  channel: CampaignChannel;
  brief: string;
  offer?: string;
  tone?: string;
  cta?: string;
  brand: Brand | null;
  count?: number;
};

export type CreativeGenerateResult = {
  mode: "live" | "demo";
  model: string | null;
  notice?: string;
  variations: CreativeDraft[];
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
    "You write outbound marketing copy for U.S. small-business financing / marketing agencies.",
    "Compliance rules (mandatory):",
    "- Never guarantee loan approval, funding amounts, rates, or timelines.",
    "- Avoid phrases like 'guaranteed funding', 'pre-approved', 'you are approved', 'instant cash'.",
    "- Frame offers as possible options subject to qualification / underwriting.",
    "- Be clear this is a marketing outreach, not a credit decision.",
    "- Use tokens exactly as {{firstName}} and {{brand}} where personalization helps.",
    channel === "sms"
      ? "- SMS: keep under ~320 characters when possible; end with a clear reply CTA and include 'STOP to opt out'."
      : "- Email: short body (3–6 short paragraphs max); include a soft unsubscribe note; subject must not overpromise.",
    "Return only the structured variations requested.",
  ].join("\n");
}

function userPrompt(input: CreativeGenerateInput, count: number): string {
  const brandLine = input.brand
    ? `Entity: ${input.brand.name} (${input.brand.shortName}). Focus: ${input.brand.focus}. Programs: ${input.brand.programs.slice(0, 4).join(", ")}.`
    : "Entity: shared library (generic working-capital / business-funding tone; use {{brand}} token).";

  return [
    `Channel: ${input.channel === "sms" ? "SMS text" : "cold email"}.`,
    brandLine,
    input.offer ? `Offer / angle: ${input.offer}` : null,
    input.tone ? `Tone: ${input.tone}` : null,
    input.cta ? `Desired CTA: ${input.cta}` : null,
    `Creative brief: ${input.brief}`,
    `Generate ${count} distinct variations.`,
    input.channel === "email"
      ? "Each variation needs: name (internal label), subject, body."
      : "Each variation needs: name (internal label), body (no subject).",
  ]
    .filter(Boolean)
    .join("\n");
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
    (input.channel === "sms" ? "Reply YES for options" : "Reply if you want a quick look");
  const tone = input.tone?.trim() || "professional and helpful";

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
          : `Hi {{firstName}},\n\n${brandToken} here. Based on what we know about small businesses like yours, ${offer} may be available if you qualify.\n\n${cta}. This is not a loan offer or approval.\n\nUnsubscribe anytime.`,
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
          ? `Hi {{firstName}} — ${brandToken}. Brief: ${input.brief.slice(0, 80)}. ${cta}. STOP to opt out.`
          : `Hi {{firstName}},\n\nBrief we worked from: ${input.brief.slice(0, 160)}\n\n${brandToken} can walk through ${offer} without promising approval.\n\n${cta}.\n\nUnsubscribe anytime.`,
    },
  ];

  return base.slice(0, Math.min(3, Math.max(1, count)));
}

export async function generateCreativeDrafts(
  input: CreativeGenerateInput,
): Promise<CreativeGenerateResult> {
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

  const model =
    resolved.provider === "gateway"
      ? resolved.modelId!
      : createGoogleGenerativeAI({ apiKey: googleApiKey() })(
          resolved.modelId as "gemini-3.5-flash",
        );

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: draftSchema }),
      system: complianceSystemPrompt(input.channel),
      prompt: userPrompt(input, count),
      temperature: 0.7,
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
