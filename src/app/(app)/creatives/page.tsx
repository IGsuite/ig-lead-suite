"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Folder,
  FolderPlus,
  Lightbulb,
  Sparkles,
  Upload,
} from "lucide-react";
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
import type {
  AdAsset,
  AdFolder,
  CampaignChannel,
  MessageTemplate,
} from "@/lib/types";

const emptyForm = {
  name: "",
  channel: "sms" as CampaignChannel,
  subject: "",
  body: "",
  folderId: "__root__",
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
    blurb: "Brief → compliance-minded variations, remixed from this company library.",
  },
  {
    id: "improve",
    label: "Improve existing",
    blurb: "Pick a saved template; AI rewrites for clarity and CTA.",
  },
  {
    id: "winners",
    label: "Suggest from winners",
    blurb: "New angles inspired by top-performing campaign messages for this company.",
  },
  {
    id: "tips",
    label: "Quick tips",
    blurb: "Short coaching on SMS/email best practices for this company.",
  },
];

const ITERATE_OPTIONS: Array<{ id: IterateAction; label: string }> = [
  { id: "shorter", label: "Shorter" },
  { id: "stronger_cta", label: "Stronger CTA" },
  { id: "softer", label: "Softer / compliance-safe" },
  { id: "more_variants", label: "More variants" },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function brandKeyToId(key: string): string | null {
  return key === "shared" ? null : key;
}

export default function AdsPage() {
  const { data, loading, error, refresh } = usePlatform();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [entityKey, setEntityKey] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<"all" | CampaignChannel>(
    "all",
  );
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [assistMode, setAssistMode] = useState<AssistMode>("create");
  const [aiChannel, setAiChannel] = useState<CampaignChannel>("sms");
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

  const resolvedEntityKey =
    entityKey ||
    (data?.brands[0]?.id ?? (data ? "shared" : ""));

  const brandId = brandKeyToId(resolvedEntityKey || "shared");
  const entityLabel =
    resolvedEntityKey === "shared"
      ? "Shared"
      : data?.brands.find((b) => b.id === resolvedEntityKey)?.shortName ||
        resolvedEntityKey;

  function selectEntity(key: string) {
    setEntityKey(key);
    setFolderId(null);
    setImproveTemplateId("");
    setAiVariations([]);
    setAiTips([]);
    setEditingId(null);
    setForm(emptyForm);
  }

  const entityFolders = useMemo(() => {
    return (data?.adFolders || []).filter((f) =>
      brandId === null ? f.brandId === null : f.brandId === brandId,
    );
  }, [data, brandId]);

  const rootFolders = useMemo(
    () => entityFolders.filter((f) => !f.parentId),
    [entityFolders],
  );

  const childFolders = useMemo(
    () =>
      entityFolders.filter((f) =>
        folderId ? f.parentId === folderId : false,
      ),
    [entityFolders, folderId],
  );

  const entityTemplates = useMemo(() => {
    return (data?.messageTemplates || []).filter((t) =>
      brandId === null ? t.brandId === null : t.brandId === brandId,
    );
  }, [data, brandId]);

  const visibleTemplates = useMemo(() => {
    return entityTemplates.filter((t) => {
      if (channelFilter !== "all" && t.channel !== channelFilter) return false;
      if (folderId === null) return t.folderId === null;
      return t.folderId === folderId;
    });
  }, [entityTemplates, channelFilter, folderId]);

  const entityAssets = useMemo(() => {
    return (data?.adAssets || []).filter((a) =>
      brandId === null ? a.brandId === null : a.brandId === brandId,
    );
  }, [data, brandId]);

  const visibleAssets = useMemo(() => {
    return entityAssets.filter((a) => {
      if (folderId === null) return a.folderId === null;
      return a.folderId === folderId;
    });
  }, [entityAssets, folderId]);

  const improveCandidates = useMemo(() => {
    return entityTemplates
      .filter((t) => t.channel === aiChannel)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [entityTemplates, aiChannel]);

  const improveTemplateValid =
    !improveTemplateId ||
    improveCandidates.some((t) => t.id === improveTemplateId);
  const effectiveImproveId = improveTemplateValid ? improveTemplateId : "";

  function startEdit(tpl: MessageTemplate) {
    setEditingId(tpl.id);
    setForm({
      name: tpl.name,
      channel: tpl.channel,
      subject: tpl.subject || "",
      body: tpl.body,
      folderId: tpl.folderId || "__root__",
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      folderId: folderId || "__root__",
    });
  }

  function applyDraftToForm(draft: AiDraft, channel: CampaignChannel) {
    setEditingId(null);
    setForm({
      name: draft.name,
      channel,
      subject: channel === "email" ? draft.subject || "" : "",
      body: draft.body,
      folderId: folderId || "__root__",
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.message("Draft loaded into the template form — edit and save");
  }

  function loadTemplateIntoImprove(tpl: MessageTemplate) {
    setAssistMode("improve");
    setAiChannel(tpl.channel);
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
          brandId,
          folderId,
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
    if (assistMode === "improve" && !iterating && !effectiveImproveId) {
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
          brandId,
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
              ? effectiveImproveId
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
          ? `Using ${lib} recent template${lib === 1 ? "" : "s"}${win ? ` · ${win} winner signal${win === 1 ? "" : "s"}` : ""} for ${entityLabel}`
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
        brandId,
        folderId: form.folderId === "__root__" ? null : form.folderId,
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

  async function createFolder() {
    if (!newFolderName.trim()) {
      toast.error("Folder name required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ads/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          brandId,
          parentId: folderId,
        }),
      });
      const json = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) throw new Error(json.error || "Could not create folder");
      toast.success("Folder created");
      setNewFolderName("");
      await refresh();
      if (json.id) setFolderId(json.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Folder failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFolder(id: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/ads/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not delete folder");
      toast.success("Folder deleted");
      if (folderId === id) setFolderId(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set(
        "brandId",
        resolvedEntityKey === "shared" ? "shared" : resolvedEntityKey,
      );
      if (folderId) body.set("folderId", folderId);
      const res = await fetch("/api/ads/assets", {
        method: "POST",
        body,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Upload failed");
      toast.success("File uploaded");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onDeleteAsset(id: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/ads/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not delete");
      toast.success("File deleted");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingPanel label="Loading Ads library…" />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;
  if (!resolvedEntityKey)
    return <LoadingPanel label="Loading Ads library…" />;

  const activeDraft = aiVariations[selectedVariation];
  const assistMeta = ASSIST_OPTIONS.find((o) => o.id === assistMode)!;
  const primaryDisabled =
    aiGenerating ||
    (assistMode === "create" && !aiBrief.trim()) ||
    (assistMode === "improve" && !effectiveImproveId);

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

  const currentFolder: AdFolder | null =
    folderId != null
      ? entityFolders.find((f) => f.id === folderId) || null
      : null;

  return (
    <div>
      <PageHeader
        title="Ads"
        description="Creators build SMS/email copy and file libraries here — pick a company first, then folders, templates, and AI wording. Not a Canva clone; image-heavy email still lives in Smartlead."
      />

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Label className="text-[color:var(--ink-muted)]">Company</Label>
            <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
              Copy, templates &amp; files per company — libraries never mix.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={resolvedEntityKey === "shared" ? "default" : "outline"}
            onClick={() => selectEntity("shared")}
          >
            Shared
          </Button>
          {data.brands.map((b) => (
            <Button
              key={b.id}
              type="button"
              size="sm"
              variant={resolvedEntityKey === b.id ? "default" : "outline"}
              onClick={() => selectEntity(b.id)}
            >
              {b.shortName}
            </Button>
          ))}
        </div>
      </section>

      <section className="mb-6 space-y-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl">
              <Sparkles className="size-5 text-[color:var(--ink-soft)]" />
              AI wording · {entityLabel}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
              Create, improve, or remix what has worked for this company — then
              iterate (shorter, stronger CTA, softer).
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              value={effectiveImproveId || undefined}
              onValueChange={(value) => {
                if (value) setImproveTemplateId(value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a saved template…" />
              </SelectTrigger>
              <SelectContent>
                {improveCandidates.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No templates for this channel
                  </SelectItem>
                ) : (
                  improveCandidates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
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
                      ? "Optional: morning send, soft ask…"
                      : "Week-12 LeadForge list, morning send, soft ask…"
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

      <div className="mb-6 grid gap-4 lg:grid-cols-[220px_1fr] animate-rise-delay-1">
        <aside className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
            Folders · {entityLabel}
          </div>
          <button
            type="button"
            onClick={() => setFolderId(null)}
            className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
              folderId === null
                ? "bg-[color:var(--ink)] text-white"
                : "text-[color:var(--ink-soft)] hover:bg-[color:var(--panel-hover)]"
            }`}
          >
            <Folder className="size-3.5 shrink-0" />
            Library root
          </button>
          <div className="space-y-0.5">
            {rootFolders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFolderId(f.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                  folderId === f.id
                    ? "bg-[color:var(--ink)] text-white"
                    : "text-[color:var(--ink-soft)] hover:bg-[color:var(--panel-hover)]"
                }`}
              >
                <Folder className="size-3.5 shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
          {rootFolders.length === 0 ? (
            <p className="mt-2 text-xs text-[color:var(--ink-muted)]">
              No folders yet for this company.
            </p>
          ) : null}
          <div className="mt-4 space-y-2 border-t border-[color:var(--ink-border)] pt-3">
            <Label className="text-xs">New folder</Label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Follow-ups"
              className="h-8 text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              disabled={saving}
              onClick={() => void createFolder()}
            >
              <FolderPlus className="size-3.5" />
              Add folder
            </Button>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-xl">
                {currentFolder ? currentFolder.name : "Library root"}
              </h2>
              <p className="text-sm text-[color:var(--ink-muted)]">
                Templates and files for {entityLabel} only.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={channelFilter}
                onValueChange={(value) => {
                  if (value) setChannelFilter(value as "all" | CampaignChannel);
                }}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
              {currentFolder ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => void deleteFolder(currentFolder.id)}
                >
                  Delete folder
                </Button>
              ) : null}
            </div>
          </div>

          {childFolders.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {childFolders.map((f) => (
                <Button
                  key={f.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setFolderId(f.id)}
                >
                  <Folder className="size-3.5" />
                  {f.name}
                </Button>
              ))}
            </div>
          ) : null}

          <form
            ref={formRef}
            onSubmit={onSave}
            className="space-y-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-[family-name:var(--font-display)] text-lg">
                {editingId ? "Edit template" : "New template"}
              </h3>
              {editingId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                >
                  Cancel edit
                </Button>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder={`${entityLabel} opener`}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select
                  value={form.channel}
                  onValueChange={(value) => {
                    if (!value) return;
                    setForm((f) => ({
                      ...f,
                      channel: value as CampaignChannel,
                    }));
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
                <Label>Folder</Label>
                <Select
                  value={form.folderId}
                  onValueChange={(value) => {
                    if (value) setForm((f) => ({ ...f, folderId: value }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__root__">Library root</SelectItem>
                    {entityFolders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, body: e.target.value }))
                }
                className="min-h-28"
                required
              />
              <p className="text-xs text-[color:var(--ink-muted)]">
                Tokens: {"{{firstName}}"}, {"{{brand}}"}. STOP / unsubscribe stay
                in the campaign send path.
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

          <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-[family-name:var(--font-display)] text-lg">
                Files
              </h3>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.txt,.csv"
                  onChange={(e) => void onUploadFile(e.target.files)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  Upload
                </Button>
              </div>
            </div>
            {visibleAssets.length === 0 ? (
              <p className="text-sm text-[color:var(--ink-muted)]">
                No files in this folder. Upload images or docs for this company.
              </p>
            ) : (
              <ul className="space-y-2">
                {visibleAssets.map((asset: AdAsset) => (
                  <li
                    key={asset.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--ink-border)] px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="size-3.5 shrink-0 text-[color:var(--ink-muted)]" />
                      <div className="min-w-0">
                        <a
                          href={`/api/ads/assets/${asset.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate font-medium underline-offset-2 hover:underline"
                        >
                          {asset.name}
                        </a>
                        <div className="text-xs text-[color:var(--ink-muted)]">
                          {asset.originalName} · {formatBytes(asset.sizeBytes)}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => void onDeleteAsset(asset.id)}
                    >
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {visibleTemplates.length === 0 ? (
            <EmptyPanel
              title="No templates here"
              description="Use AI wording above, or save a template into this folder — then pull it into Campaigns → Use template."
            />
          ) : (
            <div className="grid gap-3">
              {visibleTemplates.map((tpl) => (
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
