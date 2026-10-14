"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import { usePlatform } from "@/hooks/use-platform";

const providers = [
  {
    name: "Neon",
    role: "Postgres for the shared lead pool + all entity portals",
    key: "neon",
  },
  {
    name: "Amazon SES",
    role: "Email sending per entity subdomain",
    key: "ses",
  },
  {
    name: "Twilio",
    role: "SMS + 10DLC campaigns and numbers per entity",
    key: "twilio",
  },
  {
    name: "n8n / website APIs",
    role: "Interested reply → that entity’s CRM or site API",
    key: "n8n",
  },
  {
    name: "Metabase",
    role: "Reporting across pool, entities, and providers",
    key: "metabase",
  },
];

export default function SettingsPage() {
  const { data, loading, error, refresh } = usePlatform();
  const [storageMode, setStorageMode] = useState<"neon" | "local">("local");

  useEffect(() => {
    void fetch("/api/platform")
      .then((r) => r.json())
      .then((json: { storageMode?: "neon" | "local" }) => {
        if (json.storageMode) setStorageMode(json.storageMode);
      })
      .catch(() => undefined);
  }, [data]);

  async function reset() {
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      if (!res.ok) throw new Error("Reset failed");
      toast.success("Demo data restored with your five entities");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    }
  }

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  return (
    <div>
      <PageHeader
        title="Settings & providers"
        description="One main backend on Neon Postgres. Five entity portals. Domains are set from your live sites — wire SES / Twilio / n8n next."
      />

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          Database
        </h2>
        <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
          Current mode:{" "}
          <strong>
            {storageMode === "neon" ? "Neon Postgres (live)" : "Local JSON fallback"}
          </strong>
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[color:var(--ink-soft)]">
          <li>
            Create a project at{" "}
            <a
              className="underline underline-offset-2"
              href="https://console.neon.tech"
              target="_blank"
              rel="noreferrer"
            >
              console.neon.tech
            </a>
            .
          </li>
          <li>Copy the connection string (URI, with <code>sslmode=require</code>).</li>
          <li>
            Set <code>DATABASE_URL</code> in{" "}
            <code>.env</code> locally, or in{" "}
            <a
              className="underline underline-offset-2"
              href="https://cursor.com/dashboard/cloud-agents"
              target="_blank"
              rel="noreferrer"
            >
              Cursor Cloud Agent Secrets
            </a>
            .
          </li>
          <li>
            Run <code>npm run db:push && npm run db:seed</code> (or ask the agent
            after secrets are set).
          </li>
        </ol>
      </section>

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-1">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          Your entities
        </h2>
        <ul className="mt-4 space-y-2 text-sm text-[color:var(--ink-soft)]">
          {data.brands.map((brand) => (
            <li
              key={brand.id}
              className="rounded-xl border border-[color:var(--ink-border)] px-3 py-2"
            >
              <strong>{brand.name}</strong> — {brand.focus}
              <div className="text-xs text-[color:var(--ink-muted)]">
                {brand.programs.join(" · ")} · {brand.domain}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[color:var(--ink-muted)]">
          Rotation:{" "}
          {data.rotation.entityOrder
            .map((id) => data.brands.find((b) => b.id === id)?.shortName || id)
            .join(" → ")}
        </p>
      </section>

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-1">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          Provider stack
        </h2>
        <div className="mt-4 space-y-3">
          {providers.map((provider) => {
            const status =
              provider.key === "neon"
                ? storageMode === "neon"
                  ? "verified"
                  : "partial"
                : provider.key === "metabase"
                  ? "setup"
                  : "partial";
            return (
              <div
                key={provider.name}
                className="flex flex-col gap-2 rounded-xl border border-[color:var(--ink-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium">{provider.name}</div>
                  <p className="text-sm text-[color:var(--ink-muted)]">
                    {provider.role}
                  </p>
                </div>
                <StatusPill status={status} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          Demo data
        </h2>
        <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
          {storageMode === "neon"
            ? "Seeded into Neon Postgres."
            : "Local JSON under .data/platform.json until DATABASE_URL points at Neon."}{" "}
          {data.leads.length} shared leads · {data.brands.length} entity portals.
        </p>
        <Button className="mt-4" variant="outline" onClick={reset}>
          Reset demo data
        </Button>
      </section>
    </div>
  );
}
