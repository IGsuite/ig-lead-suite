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

type TenDlcStatus = {
  summary?: string;
  pending?: string | null;
  brands?: Array<{
    displayName: string;
    status: string;
    tcrBrandId: string | null;
    campaigns: string[];
  }>;
};

type LiveStatusKey = "neon" | "telnyx" | "email";

export default function SetupPage() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [tenDlc, setTenDlc] = useState<TenDlcStatus | null>(null);

  useEffect(() => {
    void fetch("/api/providers/status")
      .then((r) => r.json())
      .then((json: ProviderStatus) => setStatus(json))
      .catch(() => undefined);
    void fetch("/api/providers/ten-dlc")
      .then((r) => r.json())
      .then((json: TenDlcStatus) => setTenDlc(json))
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

  const brandOk = tenDlc?.brands?.some((b) => b.status === "OK");
  const hasCampaign = tenDlc?.brands?.some((b) => (b.campaigns || []).length > 0);

  const steps: Array<{
    id: string;
    title: string;
    youDo: string;
    statusKey?: LiveStatusKey;
    done?: boolean;
    pending?: boolean;
    href?: string;
    hrefLabel?: string;
  }> = [
    {
      id: "neon",
      title: "1. Neon database",
      youDo: "Connected when DATABASE_URL is set.",
      statusKey: "neon",
      done: status?.neon === "live",
    },
    {
      id: "telnyx",
      title: "2. Telnyx SMS keys",
      youDo:
        "API key + from-number are live. Assign a Telnyx number on each entity portal.",
      statusKey: "telnyx",
      done: status?.telnyx === "live",
      href: "https://portal.telnyx.com",
      hrefLabel: "Open Telnyx",
    },
    {
      id: "email",
      title: "3. Smartlead cold email",
      youDo:
        "API key + campaign ID keyed. Point Smartlead EMAIL_REPLY webhook to /api/webhooks/email.",
      statusKey: "email",
      done: Boolean(status && status.email !== "mock"),
      href: "https://app.smartlead.ai",
      hrefLabel: "Open Smartlead",
    },
    {
      id: "host",
      title: "4. Public URL for webhooks",
      youDo: status?.publicAppUrl
        ? `Set to ${status.publicAppUrl}. Tunnel URLs change when restarted — prefer Vercel for production.`
        : "Set PUBLIC_APP_URL (Cloudflare Tunnel or Vercel) and point Telnyx + Smartlead webhooks.",
      done: Boolean(status?.publicAppUrl),
    },
    {
      id: "tendlc",
      title: brandOk
        ? "5. 10DLC Campaign (next)"
        : "5. 10DLC Brand (waiting)",
      youDo: tenDlc?.summary
        ? tenDlc.summary
        : "Checking Telnyx… Brand registration can take up to ~48h.",
      done: Boolean(brandOk && hasCampaign),
      pending: Boolean(brandOk && !hasCampaign) || !brandOk,
      href: "https://portal.telnyx.com",
      hrefLabel: "Telnyx Mission Control",
    },
    {
      id: "numbers",
      title: "6. Numbers on each entity",
      youDo:
        "Entities → portal → paste Telnyx number(s). Autopilot SMS uses that entity’s first number.",
      href: "/brands",
      hrefLabel: "Open entities",
    },
    {
      id: "users",
      title: "7. Users & entity access",
      youDo:
        "Add teammates under Users. Members only see entities you assign. Vercel locks the site behind login by default (set AUTH_ADMIN_PASSWORD + AUTH_SECRET).",
      href: "/users",
      hrefLabel: "Manage users",
    },
    {
      id: "smoke",
      title: "8. Smoke test, then blast",
      youDo:
        "Upload leads → Campaigns → Build (Own, SMS) → volume you want → Launch inside the send window. Use {{firstName}}. Soft STOP language. Live cap defaults to 2000 SMS per Launch (SMS_LIVE_CAP).",
      href: "/campaigns/new",
      hrefLabel: "Build campaign",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Go live"
        description="Neon, Telnyx, and Smartlead keys are live. What’s still pending: finish the Telnyx 10DLC Campaign (Brand is already OK), then scale SMS. Use send windows on campaigns for morning vs afternoon."
        actions={
          <Link
            href="/settings"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Settings
          </Link>
        }
      />

      <div className="mb-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 animate-rise">
        <div className="text-xs uppercase tracking-wide text-[color:var(--ink-muted)]">
          What’s pending right now
        </div>
        <p className="mt-2 font-[family-name:var(--font-display)] text-xl">
          {tenDlc?.pending === "10dlc_campaign"
            ? "10DLC Campaign registration (Brand already approved)"
            : tenDlc?.pending === "10dlc_brand"
              ? "10DLC Brand still awaiting Telnyx/TCR approval"
              : tenDlc?.summary || "Checking providers…"}
        </p>
        {tenDlc?.brands?.length ? (
          <ul className="mt-2 space-y-1 text-sm text-[color:var(--ink-soft)]">
            {tenDlc.brands.map((b) => (
              <li key={b.displayName}>
                {b.displayName}: Brand <strong>{b.status}</strong>
                {b.tcrBrandId ? ` · TCR ${b.tcrBrandId}` : ""} · campaigns:{" "}
                {b.campaigns.length ? b.campaigns.join(", ") : "none yet"}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

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
                  <StatusPill
                    status={
                      step.done
                        ? "verified"
                        : step.pending
                          ? "pending"
                          : pill(step.statusKey)
                    }
                  />
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
        Full write-up: <code>SETUP.md</code>. Campaigns always launch from
        IG Lead Suite (Telnyx / Smartlead are delivery backends only).
      </p>
    </div>
  );
}
