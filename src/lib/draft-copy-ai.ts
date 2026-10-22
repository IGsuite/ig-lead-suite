import { programDraft, isFinancingBrand } from "@/lib/programs";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Brand, CampaignChannel } from "@/lib/types";

export type DraftTone = "soft" | "growth";

export type DraftCopyInput = {
  channel: CampaignChannel;
  brand: Brand | null;
  tone?: DraftTone;
  brief?: string;
  programs?: string[];
};

export type DraftCopyResult = {
  mode: "live" | "demo";
  model: string | null;
  notice?: string;
  subject?: string;
  message: string;
};

const draftSchema = z.object({
  subject: z.string().max(120).optional(),
  message: z.string().min(1).max(2000),
});

export function openaiApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

export function resolveDraftCopyAiMode(): {
  mode: "live" | "demo";
  modelId: string | null;
} {
  if (openaiApiKey()) {
    return { mode: "live", modelId: "gpt-4o-mini" };
  }
  return { mode: "demo", modelId: null };
}

function complianceSystemPrompt(channel: CampaignChannel, tone: DraftTone, brand: Brand | null): string {
  if (!isFinancingBrand(brand)) return [
    "Draft one truthful marketing SMS or email about this company's actual services. Follow only the company and selected services in the brief.",
    "Do not introduce loans, underwriting, funding promises, or another company's products unless explicitly part of the supplied service description.",
    "Do not invent pricing, outcomes, endorsements, availability or timelines. Keep planned software features distinct from launched services. For healthcare, invite a consultation; do not diagnose or promise results.",
    "Use {{firstName}} and {{brand}} tokens exactly. Keep the tone helpful and low pressure.",
    channel === "sms" ? "Return a short message with a reply CTA ending with STOP to opt out." : "Return a short subject and body with an unsubscribe line.",
  ].join("\n");
  const toneLine =
    tone === "growth"
      ? "Tone: confident business-growth / working-capital options — still soft on promises, never aggressive loan spam."
      : "Tone: soft and consultative — low pressure, qualification-first, helpful not salesy.";

  return [
    "You draft one outbound SMS or email for U.S. small-business financing / marketing outreach.",
    "Frame offers as possible working capital or business growth options subject to qualification / underwriting.",
    "Compliance rules (mandatory):",
    "- Never guarantee loan approval, funding amounts, rates, or timelines.",
    "- Avoid phrases like 'guaranteed funding', 'pre-approved', 'you are approved', 'instant cash', 'act now', 'limited spots'.",
    "- Do not use high-pressure urgency or payday-loan style spam.",
    "- Be clear this is marketing outreach, not a credit decision.",
    "- Use tokens exactly as {{firstName}} and {{brand}} for personalization.",
    toneLine,
    channel === "sms"
      ? "- SMS: one short message under ~320 characters; clear reply CTA; end with 'STOP to opt out'."
      : "- Email: short body (2–5 short paragraphs); soft unsubscribe line; subject must not overpromise.",
    "Return only the structured output requested.",
  ].join("\n");
}

function userPrompt(input: DraftCopyInput, tone: DraftTone): string {
  const brand = input.brand;
  if (!isFinancingBrand(brand)) return [
    `Company: ${brand?.name}. Focus: ${brand?.focus}.`,
    `Channel: ${input.channel}. Tone: ${tone}.`,
    `Selected services: ${(input.programs?.length ? input.programs : brand?.programs || []).join(", ")}.`,
    brand?.id === "bankable-credit" ? "The product is preparing for launch. Provider approval is pending; invite waitlist registration, not paid enrollment or live monitoring." : "",
    `Brief: ${input.brief?.trim() || "Invite the recipient to learn about the selected services."}`,
  ].join("\n");
  const focus = brand?.focus || "small-business working capital options";
  const selected = input.programs?.length ? input.programs : brand?.programs;
  const programs = selected?.length
    ? selected.join(", ")
    : "working capital, business growth financing";
  const brief =
    input.brief?.trim() ||
    "Help a small-business owner explore working capital / growth options if they qualify.";

  return [
    `Channel: ${input.channel}`,
    `Tone: ${tone}`,
    `Brand display name token: {{brand}} (entity: ${brand?.shortName || "company"})`,
    `Entity focus: ${focus}`,
    `Programs / angles: ${programs}`,
    input.programs?.length ? "Discuss only the selected programs; do not introduce other funding products. HELOC is secured by the home; include the risk of foreclosure. No invented terms or offers." : "",
    `Brief: ${brief}`,
    input.channel === "email"
      ? "Return subject + message. Greeting should use {{firstName}}."
      : "Return message only (no subject). Greeting should use {{firstName}}.",
  ].join("\n");
}

export function mockDraftCopy(input: DraftCopyInput): DraftCopyResult {
  const tone: DraftTone = input.tone === "growth" ? "growth" : "soft";
  const brandToken = "{{brand}}";
  if (input.programs?.length || !isFinancingBrand(input.brand)) return {mode:"demo",model:null,notice:"Demo draft — review before sending.",...programDraft(input.programs || [],input.channel,input.brand)};

  if (input.channel === "sms") {
    const message =
      tone === "growth"
        ? `Hi {{firstName}}, ${brandToken} here — working capital or growth options may be available for your business if you qualify. Reply YES for options, or STOP to opt out.`
        : `Hi {{firstName}}, ${brandToken} here. When you're ready, we can walk through working capital options that may fit — no pressure. Reply YES, or STOP to opt out.`;
    return {
      mode: "demo",
      model: null,
      notice:
        "Demo draft (no OPENAI_API_KEY). Add OPENAI_API_KEY for live ChatGPT drafts.",
      message,
    };
  }

  const subject =
    tone === "growth"
      ? `Working capital options from ${brandToken}`
      : `${brandToken}: a soft look at capital options`;
  const message =
    tone === "growth"
      ? `Hi {{firstName}},\n\n${brandToken} here — many small businesses review working capital or growth financing options when cash flow tightens. If you qualify, we can outline paths that may fit.\n\nReply if you'd like options. This is outreach, not an approval.\n\nUnsubscribe anytime.`
      : `Hi {{firstName}},\n\n${brandToken} here. No rush — if comparing working capital options would help, we're happy to walk through what may be available subject to qualification.\n\nReply when you're ready, or ignore this if the timing isn't right.\n\nUnsubscribe anytime.`;

  return {
    mode: "demo",
    model: null,
    notice:
      "Demo draft (no OPENAI_API_KEY). Add OPENAI_API_KEY for live ChatGPT drafts.",
    subject,
    message,
  };
}

export async function generateDraftCopy(
  input: DraftCopyInput,
): Promise<DraftCopyResult> {
  const tone: DraftTone = input.tone === "growth" ? "growth" : "soft";
  const resolved = resolveDraftCopyAiMode();

  if (resolved.mode === "demo") {
    return mockDraftCopy({ ...input, tone });
  }

  try {
    const openai = createOpenAI({ apiKey: openaiApiKey() });
    const { output } = await generateText({
      model: openai(resolved.modelId!),
      output: Output.object({ schema: draftSchema }),
      system: complianceSystemPrompt(input.channel, tone, input.brand),
      prompt: userPrompt(input, tone),
      temperature: tone === "growth" ? 0.7 : 0.55,
    });

    if (!output?.message?.trim()) {
      throw new Error("Model returned empty message");
    }

    return {
      mode: "live",
      model: resolved.modelId,
      subject:
        input.channel === "email"
          ? (output.subject || "").trim() ||
            `Options from {{brand}}`
          : undefined,
      message: output.message.trim(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Draft failed";
    const fallback = mockDraftCopy({ ...input, tone });
    return {
      ...fallback,
      model: resolved.modelId,
      notice: `Live OpenAI failed (${message}). Showing a compliance-minded demo draft instead.`,
    };
  }
}
