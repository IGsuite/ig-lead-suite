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
  publicAppUrl?: string | null;
  webhooks?: { telnyx: string; email: string } | null;
  checklist?: {
    coldEmailCampaign?: boolean;
    publicUrl?: boolean;
  };
};

type LiveStatusKey = "neon" | "telnyx" | "email";

const steps: Array<{
  id: string;
  title: string;
  youDo: string;
  statusKey?: LiveStatusKey;
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
    title: "3. Smartlead (cold email) — do now",
    youDo:
      "Create Smartlead → connect/warm domains → create a campaign → paste SMARTLEAD_API_KEY + SMARTLEAD_CAMPAIGN_ID into .env. Point Smartlead EMAIL_REPLY webhook to /api/webhooks/email. (Instantly still works via INSTANTLY_* if you prefer.)",
    statusKey: "email",
    href: "https://app.smartlead.ai",
    hrefLabel: "Open Smartlead",
  },
  {
    id: "host",
    title: "4. Public URL for webhooks",
    youDo:
      "Use Cloudflare Tunnel (cloudflared) for local tests, or deploy to Vercel. Set PUBLIC_APP_URL. Point Telnyx messaging profile → /api/webhooks/telnyx and Smartlead → /api/webhooks/email. Quick tunnels change URL when restarted.",
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
    id: "tendlc",
    title: "6. 10DLC Brand (waiting on Telnyx)",
    youDo:
      "Brand registration is pending (up to ~48h). After approval, finish the 10DLC Campaign, then scale SMS. Low-volume tests may still work before then.",
    href: "https://portal.telnyx.com",
    hrefLabel: "Telnyx Mission Control",
  },
  {
    id: "smoke",
    title: "7. Smoke test",
    youDo:
      "Upload 2–3 leads (your phone/email) → tiny campaign → reply → triage in Inbox → Email team. Repeat with a Smartlead self-send when email is keyed.",
    href: "/leads",
    hrefLabel: "Upload leads",
  },
  {
    id: "crm",
    title: "8. CRM / n8n (not today)",
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

  function pill(key?: LiveStatusKey) {
    if (!key || !status) return "setup";
    const v = status[key];
    if (key === "neon") return v === "live" ? "verified" : "partial";
    if (v === "live" || (key === "email" && v !== "mock")) return "verified";
    return "partial";
  }

  function label(key?: LiveStatusKey) {
    if (!key || !status) return "pending";
    if (key === "neon") return status.neon === "live" ? "live" : "local";
    if (key === "email") return status.email;
    return status.telnyx;
  }

  return (
    <div>
      <PageHeader
        title="Go live today"
        description="Neon + Telnyx keys are live. Next: Smartlead API keys + a public webhook URL. Scaled SMS waits on 10DLC Brand approval; cold email warmup can start as soon as Smartlead is keyed."
        actions={
          <Link
            href="/settings"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Settings
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-rise">
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
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">Public URL</div>
          <div className="mt-1 font-[family-name:var(--font-display)] text-xl">
            {status?.publicAppUrl ? "set" : "needed"}
          </div>
          {status?.webhooks ? (
            <p className="mt-2 break-all text-[10px] leading-snug text-[color:var(--ink-muted)]">
              SMS: {status.webhooks.telnyx}
              <br />
              Email: {status.webhooks.email}
            </p>
          ) : (
            <p className="mt-2 text-[10px] text-[color:var(--ink-muted)]">
              Set PUBLIC_APP_URL after tunnel/deploy
            </p>
          )}
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