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
    role: "Database + auth for the shared platform",
    status: "mock",
  },
  {
    name: "Amazon SES",
    role: "Email sending per brand subdomain",
    status: "mock",
  },
  {
    name: "Twilio",
    role: "SMS + 10DLC campaigns and numbers",
    status: "mock",
  },
  {
    name: "n8n",
    role: "CRM sync: interested reply → contact; closed deal → result",
    status: "mock",
  },
  {
    name: "Metabase",
    role: "Deeper reporting on top of the warehouse",
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
      toast.success("Demo data restored");
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
        description="Create company accounts for these five services, then swap the local mock store for live credentials. Start Twilio 10DLC immediately — it blocks texting until approved."
      />

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise">
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

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-1">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          Your pre-work (owner)
        </h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[color:var(--ink-soft)]">
          <li>Write down 5 brands: name, domain, CRM each uses.</li>
          <li>Create accounts under a company email for the five providers.</li>
          <li>Start company 10DLC registration now.</li>
          <li>Add Brand 1 sending subdomain + DNS auth records.</li>
          <li>Register Brand 1 10DLC campaign and buy 3–5 numbers.</li>
        </ol>
      </section>

      <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          Demo data
        </h2>
        <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
          Local JSON store under <code>.data/platform.json</code> with{" "}
          {data.leads.length} leads, {data.brands.length} brands, and{" "}
          {data.campaigns.length} campaigns. Safe to reset anytime.
        </p>
        <Button className="mt-4" variant="outline" onClick={reset}>
          Reset demo data
        </Button>
      </section>
    </div>
  );
}
