"use client";

import { useMemo, useState } from "react";
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

export default function CreativesPage() {
  const { data, loading, error, refresh } = usePlatform();
  const [channelFilter, setChannelFilter] = useState<"all" | CampaignChannel>(
    "all",
  );
  const [entityFilter, setEntityFilter] = useState("all");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  function startEdit(tpl: MessageTemplate) {
    setEditingId(tpl.id);
    setForm({
      name: tpl.name,
      channel: tpl.channel,
      subject: tpl.subject || "",
      body: tpl.body,
      brandId: tpl.brandId || "shared",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
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

  return (
    <div>
      <PageHeader
        title="Creatives"
        description="Write SMS and email copy once, then pull it into campaigns. Shared templates work across entities; entity-scoped ones stay with that portal."
      />

      <form
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
          description="Save SMS or email copy here, then use it from the campaign builder."
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
