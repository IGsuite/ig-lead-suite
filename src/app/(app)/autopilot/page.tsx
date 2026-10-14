"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlatform } from "@/hooks/use-platform";
import { DEFAULT_DAILY_EMAIL, DEFAULT_DAILY_SMS } from "@/lib/autopilot";
import { compactNumber, relativeDay } from "@/lib/client-format";
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
  const [rotation, setRotation] = useState<RotationConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (data) setRotation(data.rotation);
  }, [data]);

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
        `Ferris-wheel pass complete · ${json.legs?.length || 0} entity campaigns · ${compactNumber(sent)} contacts queued`,
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
        description="Ferris-wheel rotation: the shared pool turns through each entity every day. Each portal gets its own email + SMS volume — offers never mix."
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
          Autopilot enabled — rotate verified leads through each portal daily
        </label>
        <p className="mt-3 text-sm text-[color:var(--ink-muted)]">
          Order:{" "}
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
        </p>
        <p className="mt-2 text-sm text-[color:var(--ink-soft)]">
          Default target: {compactNumber(DEFAULT_DAILY_EMAIL)} emails +{" "}
          {compactNumber(DEFAULT_DAILY_SMS)} texts per entity per day. Actual
          sends use verified contacts not yet offered that entity.
        </p>
      </section>

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
                    {brand.focus} · campaigns stay under {brand.shortName} only
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
