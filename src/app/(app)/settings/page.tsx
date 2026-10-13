"use client";

import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import { usePlatform } from "@/hooks/use-platform";

const providers = [
  {
    name: "Supabase",
    role: "One database for the shared lead pool + all entity portals",
    status: "mock",
  },
  {
    name: "Amazon SES",
    role: "Email sending per entity subdomain",
    status: "mock",
  },
  {
    name: "Twilio",
    role: "SMS + 10DLC campaigns and numbers per entity",
    status: "mock",
  },
  {
    name: "n8n / website APIs",
    role: "Interested reply → that entity’s CRM or site API",
    status: "mock",
  },
  {
    name: "Metabase",
    role: "Reporting across pool, entities, and providers",
    status: "planned",
  },
];

export default function SettingsPage() {
  const { data, loading, error, refresh } = usePlatform();

  async function reset() {
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      if (!res.ok) throw new Error("Reset failed");
      toast.success("Demo data restored with your four entities");
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
        description="One main backend. Four entity portals. Lock real domains and website API URLs under each entity, then wire Supabase / SES / Twilio."
      />

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise">
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
          {providers.map((provider) => (
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
              <StatusPill status={provider.status === "mock" ? "partial" : "setup"} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          Demo data
        </h2>
        <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
          Local JSON store under <code>.data/platform.json</code> with{" "}
          {data.leads.length} shared leads and {data.brands.length} entity
          portals. Safe to reset anytime.
        </p>
        <Button className="mt-4" variant="outline" onClick={reset}>
          Reset demo data
        </Button>
      </section>
    </div>
  );
}
