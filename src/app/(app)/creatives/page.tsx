"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lightbulb, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePlatform } from "@/hooks/use-platform";
import { relativeDay } from "@/lib/client-format";
import type { CampaignChannel, MessageTemplate } from "@/lib/types";

const emptyForm = {
  name: "",
  channel: "sms" as CampaignChannel,
  subject: "",
  body: "",
  brandId: "shared",
};

type AssistMode = "create" | "improve" | "winners" | "tips";
type IterateAction =
  | "shorter"
  | "stronger_cta"
  | "softer"
  | "more_variants";

type AiDraft = {
  name: string;
  subject?: string;
  body: string;
};

const ASSIST_OPTIONS: Array<{
  id: AssistMode;
  label: string;
  blurb: string;
}> = [
  {
    id: "create",
    label: "Create new",
    blurb: "Brief → compliance-minded variations, remixed from your library.",
  },
  {
    id: "improve",
    label: "Improve existing",
    blurb: "Pick a saved creative; AI rewrites for clarity and CTA.",
  },
  {
    id: "winners",
    label: "Suggest from winners",
    blurb: "New angles inspired by top-performing campaign messages.",
  },
  {
    id: "tips",
    label: "Quick tips",
    blurb: "Short coaching on SMS/email best practices for this entity.",
  },
];

const ITERATE_OPTIONS: Array<{ id: IterateAction; label: string }> = [
  { id: "shorter", label: "Shorter" },
  { id: "stronger_cta", label: "Stronger CTA" },
  { id: "softer", label: "Softer / compliance-safe" },
  { id: "more_variants", label: "More variants" },
];

export default function CreativesPage() {
  const { data, loading, error, refresh } = usePlatform();
  const formRef = useRef<HTMLFormElement>(null);
  const [channelFilter, setChannelFilter] = useState<"all" | CampaignChannel>(
    "all",
  );
  const [entityFilter, setEntityFilter] = useState("all");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [assistMode, setAssistMode] = useState<AssistMode>("create");
  const [aiChannel, setAiChannel] = useState<CampaignChannel>("sms");
  const [aiBrandId, setAiBrandId] = useState("shared");
  const [aiBrief, setAiBrief] = useState("");
  const [aiOffer, setAiOffer] = useState("");
  const [aiTone, setAiTone] = useState("professional and clear");
  const [aiCta, setAiCta] = useState("");
  const [improveTemplateId, setImproveTemplateId] = useState<string>("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiMode, setAiMode] = useState<"live" | "demo" | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiContextNote, setAiContextNote] = useState<string | null>(null);
  const [aiVariations, setAiVariations] = useState<AiDraft[]>([]);
  const [aiTips, setAiTips] = useState<string[]>([]);
  const [selectedVariation, setSelectedVariation] = useState(0);

  useEffect(() => {
    void fetch("/api/creatives/generate", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { mode?: "live" | "demo" }) => {
        if (json.mode) setAiMode(json.mode);
      })
      .catch(() => undefined);
  }, []);

  const templates = useMemo(() => {
    const list = data?.messageTemplates || [];
    return list.filter((t) => {
      if (channelFilter !== "all" && t.channel !== channelFilter) return false;
      if (entityFilter === "shared" && t.brandId !== null) return false;
      if (
        entityFilter !== "all" &&
        entityFilter !== "shared" &&
        t.brandId !== entityFilter
      )
        return false;
      return true;
    });
  }, [data, channelFilter, entityFilter]);

  const improveCandidates = useMemo(() => {
    const list = data?.messageTemplates || [];
    return list
      .filter((t) => {
        if (t.channel !== aiChannel) return false;
        if (aiBrandId === "shared") return t.brandId === null;
        return t.brandId === aiBrandId || t.brandId === null;
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [data, aiChannel, aiBrandId]);

  useEffect(() => {
    if (
      improveTemplateId &&
      !improveCandidates.some((t) => t.id === improveTemplateId)
    ) {
      setImproveTemplateId("");
    }
  }, [improveCandidates, improveTemplateId]);

  function startEdit(tpl: MessageTemplate) {
    setEditingId(tpl.id);
    setForm({
      name: tpl.name,
      channel: tpl.channel,
      subject: tpl.subject || "",
      body: tpl.body,
      brandId: tpl.brandId || "shared",
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function applyDraftToForm(draft: AiDraft, channel: CampaignChannel) {
    setEditingId(null);
    setForm({
      name: draft.name,
      channel,
      subject: channel === "email" ? draft.subject || "" : "",
      body: draft.body,
      brandId: aiBrandId,
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.message("Draft loaded into the template form — edit and save");
  }

  function loadTemplateIntoImprove(tpl: MessageTemplate) {
    setAssistMode("improve");
    setAiChannel(tpl.channel);
    setAiBrandId(tpl.brandId || "shared");
    setImproveTemplateId(tpl.id);
    setAiBrief(`Improve ${tpl.name}: tighter hook and clearer CTA`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.message("Loaded into Improve existing — adjust notes and generate");
  }

  async function saveDraftAsTemplate(draft: AiDraft, channel: CampaignChannel) {
    setSaving(true);
    try {
      const res = await fetch("/api/creatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          channel,
          subject: channel === "email" ? draft.subject : undefined,
          body: draft.body,
          brandId: aiBrandId === "shared" ? null : aiBrandId,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not save template");
      toast.success("Saved as template");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function runGenerate(opts?: {
    iterate?: IterateAction;
    baseDraft?: AiDraft;
  }) {
    const iterating = Boolean(opts?.iterate && opts.baseDraft);
    if (assistMode === "improve" && !iterating && !improveTemplateId) {
      toast.error("Pick a template to improve");
      return;
    }
    if (assistMode === "create" && !iterating && !aiBrief.trim()) {
      toast.error("Add a short brief first");
      return;
    }

    setAiGenerating(true);
    if (!iterating) {
      setAiVariations([]);
      setAiTips([]);
      setSelectedVariation(0);
    }
    try {
      const res = await fetch("/api/creatives/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: aiChannel,
          brandId: aiBrandId === "shared" ? null : aiBrandId,
          brief: aiBrief,
          offer: aiOffer || undefined,
          tone: aiTone || undefined,
          cta: aiCta || undefined,
          count: 3,
          assistMode,
          iterate: opts?.iterate,
          baseDraft: opts?.baseDraft,
          templateId:
            !iterating && assistMode === "improve"
              ? improveTemplateId
              : undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        mode?: "live" | "demo";
        notice?: string;
        variations?: AiDraft[];
        tips?: string[];
        context?: { libraryCount?: number; winnerCount?: number };
      };
      if (!res.ok) throw new Error(json.error || "Generate failed");
      setAiMode(json.mode || "demo");
      setAiNotice(json.notice || null);
      const lib = json.context?.libraryCount ?? 0;
      const win = json.context?.winnerCount ?? 0;
      setAiContextNote(
        lib || win
          ? `Using ${lib} recent template${lib === 1 ? "" : "s"}${win ? ` · ${win} winner signal${win === 1 ? "" : "s"}` : ""} for this entity/channel`
          : null,
      );

      if (assistMode === "tips" && !iterating) {
        setAiTips(json.tips || []);
        setAiVariations([]);
        toast.success(
          json.mode === "demo" ? "Demo tips ready" : "Coaching tips ready",
        );
      } else {
        setAiVariations(json.variations || []);
        setAiTips([]);
        setSelectedVariation(0);
        if (json.mode === "demo") {
          toast.message(json.notice || "Demo drafts ready");
        } else {
          toast.success(
            iterating ? "Updated draft ready" : "AI drafts ready — pick one",
          );
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setAiGenerating(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        channel: form.channel,
        subject: form.channel === "email" ? form.subject : undefined,
        body: form.body,
        brandId: form.brandId === "shared" ? null : form.brandId,
        ...(editingId ? { action: "update" as const, id: editingId } : {}),
      };
      const res = await fetch("/api/creatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not save template");
      toast.success(editingId ? "Template updated" : "Template created");
      resetForm();
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/creatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not delete");
      toast.success("Template deleted");
      if (editingId === id) resetForm();
      if (improveTemplateId === id) setImproveTemplateId("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingPanel label="Loading creatives…" />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  const activeDraft = aiVariations[selectedVariation];
  const assistMeta = ASSIST_OPTIONS.find((o) => o.id === assistMode)!;
  const primaryDisabled =
    aiGenerating ||
    (assistMode === "create" && !aiBrief.trim()) ||
    (assistMode === "improve" && !improveTemplateId);

  const primaryLabel =
    assistMode === "tips"
      ? aiGenerating
        ? "Loading tips…"
        : "Get quick tips"
      : assistMode === "improve"
        ? aiGenerating
          ? "Improving…"
          : "Improve template"
        : assistMode === "winners"
          ? aiGenerating
            ? "Suggesting…"
            : "Suggest from winners"
          : aiGenerating
            ? "Generating…"
            : "Generate 3 variations";

  return (
    <div>
      <PageHeader
        title="Creatives"
        description="Ads development desk: draft SMS and email copy with an AI coach, iterate faster, save templates, then pull them into campaigns. Image-heavy email layouts still live in Smartlead."
      />

      <section className="mb-6 space-y-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl">
              <Sparkles className="size-5 text-[color:var(--ink-soft)]" />
              Creative assistant
            </h2>
            <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
              Create, improve, or remix what has worked — then iterate (shorter,
              stronger CTA, softer). Financial-services safe prompting; SMS
              samples keep STOP.
            </p>
          </div>
          {aiMode ? (
            <span className="rounded-md border border-[color:var(--ink-border)] px-2 py-1 text-xs text-[color:var(--ink-muted)]">
              {aiMode === "live" ? "Live Gemini" : "Demo mode (no AI key)"}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {ASSIST_OPTIONS.map((opt) => (
            <Button
              key={opt.id}
              type="button"
              size="sm"
              variant={assistMode === opt.id ? "default" : "outline"}
              onClick={() => {
                setAssistMode(opt.id);
                setAiVariations([]);
                setAiTips([]);
                setAiNotice(null);
                setSelectedVariation(0);
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <p className="text-sm text-[color:var(--ink-muted)]">{assistMeta.blurb}</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Channel</Label>
            <Select
              value={aiChannel}
              onValueChange={(value) => {
                if (!value) return;
                setAiChannel(value as CampaignChannel);
                setAiVariations([]);
                setAiTips([]);
                setImproveTemplateId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Entity context</Label>
            <Select
              value={aiBrandId}
              onValueChange={(value) => {
                if (value) {
                  setAiBrandId(value);
                  setImproveTemplateId("");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">Shared (generic)</SelectItem>
                {data.brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.shortName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {assistMode !== "tips" ? (
            <>
              <div className="space-y-2">
                <Label>Tone</Label>
                <Input
                  value={aiTone}
                  onChange={(e) => setAiTone(e.target.value)}
                  placeholder="professional and clear"
                />
              </div>
              <div className="space-y-2">
                <Label>CTA</Label>
                <Input
                  value={aiCta}
                  onChange={(e) => setAiCta(e.target.value)}
                  placeholder={
                    aiChannel === "sms"
                      ? "Reply YES for options"
                      : "Reply to compare options"
                  }
                />
              </div>
            </>
          ) : null}
        </div>

        {assistMode === "improve" ? (
          <div className="space-y-2">
            <Label>Template to improve</Label>
            <Select
              value={improveTemplateId || undefined}
              onValueChange={(value) => {
                if (value) setImproveTemplateId(value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a saved creative…" />
              </SelectTrigger>
              <SelectContent>
                {improveCandidates.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No templates for this channel/entity
                  </SelectItem>
                ) : (
                  improveCandidates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.brandId ? "" : " (shared)"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {assistMode !== "tips" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Offer / angle</Label>
              <Input
                value={aiOffer}
                onChange={(e) => setAiOffer(e.target.value)}
                placeholder="MCA / working capital for qualified SMBs"
              />
            </div>
            <div className="space-y-2">
              <Label>
                {assistMode === "improve"
                  ? "Improvement notes"
                  : assistMode === "winners"
                    ? "Brief (optional)"
                    : "Brief"}
              </Label>
              <Textarea
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                className="min-h-20"
                placeholder={
                  assistMode === "improve"
                    ? "Make CTA clearer, keep soft compliance tone…"
                    : assistMode === "winners"
                      ? "Optional: morning send, soft ask, similar to last week’s winner…"
                      : "Week-12 LeadForge list, morning send, soft ask to reply if interested in capital options…"
                }
              />
            </div>
          </div>
        ) : null}

        <Button
          type="button"
          disabled={primaryDisabled}
          onClick={() => void runGenerate()}
        >
          {primaryLabel}
        </Button>

        {aiNotice ? (
          <p className="rounded-xl bg-[color:var(--panel-hover)] px-3 py-2 text-sm text-[color:var(--ink-soft)]">
            {aiNotice}
          </p>
        ) : null}
        {aiContextNote ? (
          <p className="text-xs text-[color:var(--ink-muted)]">{aiContextNote}</p>
        ) : null}

        {aiTips.length > 0 ? (
          <div className="space-y-3 border-t border-[color:var(--ink-border)] pt-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Lightbulb className="size-4 text-[color:var(--ink-soft)]" />
              Coaching tips
            </h3>
            <ul className="space-y-2">
              {aiTips.map((tip, idx) => (
                <li
                  key={`${idx}-${tip.slice(0, 24)}`}
                  className="rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--canvas)]/40 px-3 py-2 text-sm text-[color:var(--ink-soft)]"
                >
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {aiVariations.length > 0 ? (
          <div className="space-y-3 border-t border-[color:var(--ink-border)] pt-4">
            <div className="flex flex-wrap gap-2">
              {aiVariations.map((draft, idx) => (
                <Button
                  key={`${draft.name}-${idx}`}
                  type="button"
                  size="sm"
                  variant={selectedVariation === idx ? "default" : "outline"}
                  onClick={() => setSelectedVariation(idx)}
                >
                  Option {idx + 1}
                </Button>
              ))}
            </div>
            {activeDraft ? (
              <article className="rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--canvas)]/40 p-4">
                <div className="font-medium">{activeDraft.name}</div>
                {aiChannel === "email" && activeDraft.subject ? (
                  <p className="mt-2 text-sm text-[color:var(--ink-soft)]">
                    Subject: {activeDraft.subject}
                  </p>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--ink-soft)]">
                  {activeDraft.body}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyDraftToForm(activeDraft, aiChannel)}
                  >
                    Use in form
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving}
                    onClick={() =>
                      void saveDraftAsTemplate(activeDraft, aiChannel)
                    }
                  >
                    Save as template
                  </Button>
                </div>
                <div className="mt-4 border-t border-[color:var(--ink-border)] pt-3">
                  <p className="mb-2 text-xs text-[color:var(--ink-muted)]">
                    Iterate on this draft
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ITERATE_OPTIONS.map((opt) => (
                      <Button
                        key={opt.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={aiGenerating}
                        onClick={() =>
                          void runGenerate({
                            iterate: opt.id,
                            baseDraft: activeDraft,
                          })
                        }
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </article>
            ) : null}
          </div>
        ) : null}
      </section>

      <form
        ref={formRef}
        onSubmit={onSave}
        className="mb-6 space-y-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            {editingId ? "Edit template" : "New template"}
          </h2>
          {editingId ? (
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Cancel edit
            </Button>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="MCA opener — Abstract"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Channel</Label>
            <Select
              value={form.channel}
              onValueChange={(value) => {
                if (!value) return;
                setForm((f) => ({ ...f, channel: value as CampaignChannel }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Entity scope</Label>
            <Select
              value={form.brandId}
              onValueChange={(value) => {
                if (value) setForm((f) => ({ ...f, brandId: value }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">Shared (all entities)</SelectItem>
                {data.brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.shortName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {form.channel === "email" ? (
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={form.subject}
              onChange={(e) =>
                setForm((f) => ({ ...f, subject: e.target.value }))
              }
              placeholder="Working capital from {{brand}}"
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>Message</Label>
          <Textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            className="min-h-32"
            required
          />
          <p className="text-xs text-[color:var(--ink-muted)]">
            Tokens: {"{{firstName}}"}, {"{{brand}}"}. STOP / unsubscribe stay in
            the campaign send path.
          </p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving
            ? "Saving…"
            : editingId
              ? "Update template"
              : "Save template"}
        </Button>
      </form>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Label>Channel</Label>
          <Select
            value={channelFilter}
            onValueChange={(value) => {
              if (value) setChannelFilter(value as "all" | CampaignChannel);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Entity</Label>
          <Select
            value={entityFilter}
            onValueChange={(value) => {
              if (value) setEntityFilter(value);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scopes</SelectItem>
              <SelectItem value="shared">Shared only</SelectItem>
              {data.brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.shortName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {templates.length === 0 ? (
        <EmptyPanel
          title="No creatives yet"
          description="Use the Creative assistant above, or write a template manually — then use it from the campaign builder."
        />
      ) : (
        <div className="grid gap-3 animate-rise-delay-1">
          {templates.map((tpl) => {
            const brand =
              tpl.brandId &&
              data.brands.find((b) => b.id === tpl.brandId)?.shortName;
            return (
              <article
                key={tpl.id}
                className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{tpl.name}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-[color:var(--ink-muted)]">
                      <span className="rounded-md border border-[color:var(--ink-border)] px-2 py-0.5 uppercase tracking-wide">
                        {tpl.channel}
                      </span>
                      <span className="rounded-md border border-[color:var(--ink-border)] px-2 py-0.5">
                        {brand || "Shared"}
                      </span>
                      <span>Updated {relativeDay(tpl.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => loadTemplateIntoImprove(tpl)}
                    >
                      Improve with AI
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(tpl)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() => void onDelete(tpl.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {tpl.channel === "email" && tpl.subject ? (
                  <p className="mt-3 text-sm font-medium text-[color:var(--ink-soft)]">
                    Subject: {tpl.subject}
                  </p>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--ink-soft)]">
                  {tpl.body}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
