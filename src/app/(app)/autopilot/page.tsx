"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlatform } from "@/hooks/use-platform";
import { DEFAULT_DAILY_EMAIL, DEFAULT_DAILY_SMS } from "@/lib/autopilot";
import { compactNumber, relativeDay } from "@/lib/client-format";
import { wheelVisibility } from "@/lib/rotation-select";
import type {
  EntityDailyQuota,
  RotationConfig,
  SendWindowPreset,
} from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AutopilotPage() {
  const { data, loading, error, refresh } = usePlatform();
  const [rotationDraft, setRotation] = useState<RotationConfig | null>(null);
  const rotation = rotationDraft ?? data?.rotation ?? null;
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const visibility = useMemo(() => {
    if (!data || !rotation) return null;
    return wheelVisibility({
      brands: data.brands,
      rotation,
      sendEvents: data.sendEvents || [],
      leads: data.leads,
    });
  }, [data, rotation]);

  function updateQuota(
    entityId: string,
    patch: Partial<EntityDailyQuota>,
  ) {
    if (!rotation) return;
    setRotation({
      ...rotation,
      quotas: rotation.quotas.map((q) =>
        q.entityId === entityId ? { ...q, ...patch } : q,
      ),
    });
  }

  async function save() {
    if (!rotation) return;
    setSaving(true);
    try {
      const res = await fetch("/api/autopilot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rotation),
      });
      if (!res.ok) throw new Error("Could not save autopilot");
      setRotation((await res.json()) as RotationConfig);
      toast.success("Autopilot settings saved");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      await save();
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const json = (await res.json()) as {
        error?: string;
        legs?: Array<{ entityId: string; channel: string; sent: number }>;
        nextRunAt?: string;
      };
      if (!res.ok) throw new Error(json.error || "Run failed");
      const sent = (json.legs || []).reduce((s, l) => s + l.sent, 0);
      toast.success(
        `Auto wheel pass complete · ${json.legs?.length || 0} entity campaigns · ${compactNumber(sent)} contacts queued`,
      );
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading || !rotation) return <LoadingPanel label="Loading autopilot…" />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  const enabledCount = rotation.quotas.filter((q) => q.enabled).length;
  const dailyEmail = rotation.quotas
    .filter((q) => q.enabled)
    .reduce((s, q) => s + q.dailyEmailVolume, 0);
  const dailySms = rotation.quotas
    .filter((q) => q.enabled)
    .reduce((s, q) => s + q.dailySmsVolume, 0);

  return (
    <div>
      <PageHeader
        title="Autopilot"
        description="Auto wheel: each day, every entity on the wheel pulls its daily volume from the shared pool with fair rotation — not the same slice every day. Own campaigns stay on Campaigns."
        actions={
          <>
            <Button variant="outline" disabled={saving || running} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button disabled={running || saving} onClick={() => void runNow()}>
              {running ? "Running…" : "Run today’s pass"}
            </Button>
          </>
        }
      />

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
        <h2 className="text-xl font-[family-name:var(--font-display)]">Selected product campaigns</h2>
        <p className="mt-2 text-sm text-[color:var(--ink-muted)]">Use the marketing calendar to choose each day’s company, product, campaign, template and sending time. The calendar has its own approval and enable controls; enabling it turns generic rotation off.</p>
        <Link href="/campaigns/calendar" className="mt-3 inline-block text-sm underline">Open marketing calendar</Link>
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-rise">
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">Autopilot</div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {rotation.autopilotEnabled ? "On" : "Off"}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">
            Entities in wheel
          </div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {enabledCount}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">
            Daily emails (all)
          </div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {compactNumber(dailyEmail)}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">
            Daily SMS (all)
          </div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {compactNumber(dailySms)}
          </div>
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={rotation.autopilotEnabled}
            onChange={(e) =>
              setRotation({ ...rotation, autopilotEnabled: e.target.checked })
            }
          />
          Auto wheel enabled — rotate verified leads through each portal daily
        </label>
        <p className="mt-3 text-sm text-[color:var(--ink-muted)]">
          Schedule order:{" "}
          <strong>
            {rotation.entityOrder
              .map(
                (id) => data.brands.find((b) => b.id === id)?.shortName || id,
              )
              .join(" → ")}
          </strong>
          . Last run:{" "}
          {rotation.lastRunAt ? relativeDay(rotation.lastRunAt) : "never"} ·
          Next:{" "}
          {rotation.nextRunAt ? relativeDay(rotation.nextRunAt) : "not scheduled"}
          · Pool cursor: {rotation.poolCursor ?? 0}
        </p>
        <p className="mt-2 text-sm text-[color:var(--ink-soft)]">
          Default target: {compactNumber(DEFAULT_DAILY_EMAIL)} emails +{" "}
          {compactNumber(DEFAULT_DAILY_SMS)} texts per entity per day. Selection
          skips global opt-outs, same-message fingerprints (no next-day repeat),
          and advances the pool cursor so volumes walk the list.
        </p>
      </section>

      {visibility ? (
        <section className="mb-6 grid gap-4 lg:grid-cols-2 animate-rise-delay-1">
          <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
            <h2 className="font-[family-name:var(--font-display)] text-xl">
              Wheel schedule / last sent
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {visibility.order.map((row, i) => (
                <li
                  key={row.entityId}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--ink-border)] pb-2 last:border-0"
                >
                  <span>
                    <span className="text-[color:var(--ink-muted)]">
                      {i + 1}.
                    </span>{" "}
                    <strong>{row.shortName}</strong>
                    {!row.enabled ? (
                      <span className="ml-2 text-xs text-[color:var(--ink-muted)]">
                        off wheel
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-[color:var(--ink-muted)]">
                    {compactNumber(row.dailySmsVolume)} SMS /{" "}
                    {compactNumber(row.dailyEmailVolume)} email · last{" "}
                    {row.lastSentAt
                      ? `${relativeDay(row.lastSentAt)} (${compactNumber(row.lastSentCount)})`
                      : "never"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
            <h2 className="font-[family-name:var(--font-display)] text-xl">
              Next up in pool
            </h2>
            <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
              Least-recently messaged eligible leads (preview). Cursor{" "}
              {visibility.poolCursor}.
            </p>
            {visibility.nextUpLeads.length === 0 ? (
              <p className="mt-3 text-sm text-[color:var(--ink-muted)]">
                No eligible leads in the pool yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {visibility.nextUpLeads.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/leads/${l.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {l.name}
                    </Link>
                    <span className="text-[color:var(--ink-muted)]">
                      {" "}
                      · {l.email || "—"} · {l.phone || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      <section className="space-y-3 animate-rise-delay-2">
        {rotation.quotas.map((quota) => {
          const brand = data.brands.find((b) => b.id === quota.entityId);
          if (!brand) return null;
          return (
            <div
              key={quota.entityId}
              className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-xl">
                    {brand.name}
                  </h2>
                  <p className="text-xs text-[color:var(--ink-muted)]">
                    Daily volume on the Auto wheel · Own campaigns stay under
                    Campaigns
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={quota.enabled}
                    onChange={(e) =>
                      updateQuota(quota.entityId, { enabled: e.target.checked })
                    }
                  />
                  On the wheel
                </label>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Daily email volume</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    value={quota.dailyEmailVolume}
                    disabled={!quota.enabled}
                    onChange={(e) =>
                      updateQuota(quota.entityId, {
                        dailyEmailVolume: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Daily SMS volume</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    value={quota.dailySmsVolume}
                    disabled={!quota.enabled}
                    onChange={(e) =>
                      updateQuota(quota.entityId, {
                        dailySmsVolume: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Send window</Label>
                  <Select
                    value={quota.sendWindowPreset || "morning"}
                    disabled={!quota.enabled}
                    onValueChange={(value) => {
                      if (value)
                        updateQuota(quota.entityId, {
                          sendWindowPreset: value as SendWindowPreset,
                          timezone: "America/New_York",
                        });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="afternoon">Afternoon</SelectItem>
                      <SelectItem value="evening">Evening</SelectItem>
                      <SelectItem value="any">Any time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
