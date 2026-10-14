"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProviderStatus = {
  neon: string;
  telnyx: string;
  email: string;
};

const steps: Array<{
  id: string;
  title: string;
  youDo: string;
  statusKey?: keyof ProviderStatus;
  href?: string;
  hrefLabel?: string;
}> = [
  {
    id: "neon",
    title: "1. Neon database",
    youDo: "Already connected when DATABASE_URL is set.",
    statusKey: "neon",
  },
  {
    id: "telnyx",
    title: "2. Telnyx SMS",
    youDo:
      "Create Telnyx account → API key → buy numbers → paste TELNYX_API_KEY + TELNYX_FROM_NUMBER into secrets. Assign a number on each entity portal. Start 10DLC registration.",
    statusKey: "telnyx",
    href: "https://portal.telnyx.com",
    hrefLabel: "Open Telnyx Mission Control",
  },
  {
    id: "email",
    title: "3. Instantly or Smartlead (cold email)",
    youDo:
      "Create Instantly or Smartlead → connect/warm domains → create campaigns → INSTANTLY_API_KEY + INSTANTLY_CAMPAIGN_ID (or Smartlead equivalents).",
    statusKey: "email",
    href: "https://instantly.ai",
    hrefLabel: "Open Instantly",
  },
  {
    id: "host",
    title: "4. Public URL for webhooks",
    youDo:
      "Deploy SignalDesk (Vercel etc.) or use a tunnel. Point Telnyx messaging webhook to /api/webhooks/telnyx and email replies to /api/webhooks/email.",
  },
  {
    id: "numbers",
    title: "5. Numbers on each entity",
    youDo:
      "Entities → open each portal → paste Telnyx number(s). Autopilot SMS uses that entity’s first number.",
    href: "/brands",
    hrefLabel: "Open entities",
  },
  {
    id: "smoke",
    title: "6. Smoke test",
    youDo:
      "Upload 2–3 leads (your phone/email) → tiny campaign → reply → triage in Inbox → Email team.",
    href: "/leads",
    hrefLabel: "Upload leads",
  },
  {
    id: "crm",
    title: "7. CRM / n8n (not today)",
    youDo:
      "Skip for now. Use Inbox → Good lead → Email team. Wire n8n when you’re ready.",
  },
];

export default function SetupPage() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);

  useEffect(() => {
    void fetch("/api/providers/status")
      .then((r) => r.json())
      .then((json: ProviderStatus) => setStatus(json))
      .catch(() => undefined);
  }, []);

  function pill(key?: keyof ProviderStatus) {
    if (!key || !status) return "setup";
    const v = status[key];
    if (key === "neon") return v === "live" ? "verified" : "partial";
    if (v === "live" || (key === "email" && v !== "mock")) return "verified";
    return "partial";
  }

  function label(key?: keyof ProviderStatus) {
    if (!key || !status) return "pending";
    if (key === "neon") return status.neon === "live" ? "live" : "local";
    if (key === "email") return status.email;
    return status[key];
  }

  return (
    <div>
      <PageHeader
        title="Go live today"
        description="SignalDesk ops are ready. Finish Telnyx + Instantly/Smartlead + a public webhook URL. Full 20k/day volume waits on 10DLC and domain warmup."
        actions={
          <Link
            href="/settings"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Settings
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3 animate-rise">
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">Neon</div>
          <div className="mt-1 font-[family-name:var(--font-display)] text-xl">
            {status?.neon || "…"}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">Telnyx SMS</div>
          <div className="mt-1 font-[family-name:var(--font-display)] text-xl">
            {status?.telnyx || "…"}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">Cold email</div>
          <div className="mt-1 font-[family-name:var(--font-display)] text-xl">
            {status?.email || "…"}
          </div>
        </div>
      </div>

      <ol className="space-y-3 animate-rise-delay-1">
        {steps.map((step) => (
          <li
            key={step.id}
            className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-[family-name:var(--font-display)] text-xl">
                    {step.title}
                  </h2>
                  <StatusPill status={pill(step.statusKey)} />
                  {step.statusKey ? (
                    <span className="text-xs text-[color:var(--ink-muted)]">
                      {label(step.statusKey)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-[color:var(--ink-soft)]">
                  {step.youDo}
                </p>
              </div>
              {step.href ? (
                <a
                  href={step.href}
                  target={step.href.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "shrink-0",
                  )}
                >
                  {step.hrefLabel || "Open"}
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-sm text-[color:var(--ink-muted)]">
        Full write-up: <code>SETUP.md</code> in the repo. Paste API keys into{" "}
        <code>.env</code> or Cursor Cloud Agent Secrets, then restart — Status
        above flips from mock → live.
      </p>
    </div>
  );
}