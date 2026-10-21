"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, relativeDay } from "@/lib/client-format";
import type {
  Brand,
  Campaign,
  Lead,
  LeadSendEvent,
  OptOut,
  Reply,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { LeadSmsConsent } from "@/components/lead-sms-consent";

type LeadDetailPayload = {
  lead: Lead;
  replies: Reply[];
  sendEvents: LeadSendEvent[];
  campaigns: Campaign[];
  optOuts: OptOut[];
  entityTouches: Array<{
    entityId: string;
    name: string;
    shortName: string;
    sendCount: number;
    lastSentAt: string | null;
  }>;
  brands: Brand[];
};

async function fetchLeadDetail(id: string, signal?: AbortSignal) {
  const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, { cache: "no-store", signal });
  const json = (await res.json()) as LeadDetailPayload & { error?: string };
  if (!res.ok) throw new Error(json.error || "Lead not found");
  return json;
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const [payload, setPayload] = useState<LeadDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const json = await fetchLeadDetail(params.id);
      setPayload(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lead");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetchLeadDetail(params.id, controller.signal).then(json => {
      if (!controller.signal.aborted) { setPayload(json); setError(null); }
    }).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Failed to load lead");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [params.id]);

  if (loading || (!error && payload?.lead.id !== params.id)) return <LoadingPanel label="Loading lead…" />;
  if (error || !payload)
    return <ErrorPanel message={error || "Unknown error"} onRetry={load} />;

  const { lead, replies, sendEvents, campaigns, optOuts, entityTouches } =
    payload;
  const name =
    [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unknown lead";
  const inboxEntity =
    lead.lastEntityId || entityTouches[0]?.entityId || "abstract";

  return (
    <div>
      <PageHeader
        title={name}
        description={`${lead.source} / ${lead.groupName} · purchased ${relativeDay(lead.purchaseDate)} · ${money(lead.costCents)} file share`}
        actions={
          <>
            <Link
              href="/leads"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Back to pool
            </Link>
            <Link
              href={`/inbox?entity=${inboxEntity}&leadId=${lead.id}`}
              className={cn(buttonVariants())}
            >
              Open inbox thread
            </Link>
          </>
        }
      />

      {lead.optedOut || lead.status === "opted_out" ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 animate-rise">
          <strong>Global opt-out.</strong> This person is blocked across{" "}
          <strong>all entities and channels</strong> (SMS and email). Autopilot
          and Own campaigns will not message them.
        </div>
      ) : (
        <p className="mb-6 text-sm text-[color:var(--ink-muted)] animate-rise">
          Global opt-out (when set) blocks a contact across all entities and
          channels — not just one portal.
        </p>
      )}

      <LeadSmsConsent lead={lead} brands={payload.brands} onChange={load} />

      <div className="mb-6 grid gap-4 lg:grid-cols-3 animate-rise">
        <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 lg:col-span-1">
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            Contact
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-[color:var(--ink-muted)]">
                Business
              </dt>
              <dd className="mt-0.5">{lead.businessName || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--ink-muted)]">Email</dt>
              <dd className="mt-0.5 flex items-center gap-2">
                {lead.email || "—"}
                <StatusPill status={lead.emailStatus} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--ink-muted)]">Phone</dt>
              <dd className="mt-0.5 flex items-center gap-2">
                {lead.phone || "—"}
                <StatusPill status={lead.phoneStatus} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--ink-muted)]">Status</dt>
              <dd className="mt-0.5">
                <StatusPill status={lead.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--ink-muted)]">Source</dt>
              <dd className="mt-0.5">
                {lead.source} · {lead.groupName}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--ink-muted)]">
                Last entity
              </dt>
              <dd className="mt-0.5">
                {lead.lastEntityId
                  ? payload.brands.find((b) => b.id === lead.lastEntityId)
                      ?.shortName || lead.lastEntityId
                  : "—"}
              </dd>
            </div>
            {lead.verifyNotes ? (
              <div>
                <dt className="text-xs text-[color:var(--ink-muted)]">
                  Verify notes
                </dt>
                <dd className="mt-0.5 text-[color:var(--ink-soft)]">
                  {lead.verifyNotes}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 lg:col-span-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            Entity touches
          </h2>
          <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
            Which portals have already offered this shared-pool lead.
          </p>
          {entityTouches.length === 0 ? (
            <p className="mt-4 text-sm text-[color:var(--ink-muted)]">
              Fresh — not yet offered to any entity.
            </p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-[color:var(--ink-border)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Sends</TableHead>
                    <TableHead>Last sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entityTouches.map((t) => (
                    <TableRow key={t.entityId}>
                      <TableCell>
                        <Link
                          href={`/brands/${t.entityId}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {t.name}
                        </Link>
                      </TableCell>
                      <TableCell>{t.sendCount}</TableCell>
                      <TableCell>
                        {t.lastSentAt ? relativeDay(t.lastSentAt) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl">
              Inbox / replies
            </h2>
            <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
              Conversation history for this lead. Prefer this page as home; jump
              to the entity inbox when you need the full queue.
            </p>
          </div>
          <Link
            href={`/inbox?entity=${inboxEntity}&leadId=${lead.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Entity inbox
          </Link>
        </div>
        {replies.length === 0 ? (
          <div className="mt-4">
            <EmptyPanel
              title="No replies yet"
              description="When this lead texts or emails back, replies show here with sentiment and forward flags."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {replies.map((reply) => {
              const brand = payload.brands.find((b) => b.id === reply.brandId);
              return (
                <li
                  key={reply.id}
                  className="rounded-xl border border-[color:var(--ink-border)] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--ink-muted)]">
                    <StatusPill status={reply.channel} />
                    <StatusPill status={reply.sentiment} />
                    <span>{brand?.shortName || reply.brandId}</span>
                    <span>{relativeDay(reply.createdAt)}</span>
                    {reply.manualForwarded ? <span>Forwarded</span> : null}
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-wrap">{reply.body}</p>
                  <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
                    From {reply.from}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-2">
        <h2 className="font-[family-name:var(--font-display)] text-xl">
          SMS / email send history
        </h2>
        <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
          Durable rotation log — same message fingerprint will not re-send the
          next day.
        </p>
        {sendEvents.length === 0 ? (
          <p className="mt-4 text-sm text-[color:var(--ink-muted)]">
            No recorded sends yet for this lead.
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-[color:var(--ink-border)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Campaign</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sendEvents.map((e) => {
                  const brand = payload.brands.find((b) => b.id === e.entityId);
                  const camp = campaigns.find((c) => c.id === e.campaignId);
                  return (
                    <TableRow key={e.id}>
                      <TableCell>{relativeDay(e.sentAt)}</TableCell>
                      <TableCell>{brand?.shortName || e.entityId}</TableCell>
                      <TableCell className="uppercase">{e.channel}</TableCell>
                      <TableCell>
                        {e.mode === "auto" ? "Auto wheel" : "Own"}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate">
                        {camp?.name || e.campaignId}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl">
          Opt-out records
        </h2>
        {optOuts.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--ink-muted)]">
            No suppression rows for this contact.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {optOuts.map((o) => (
              <li key={o.id}>
                {o.contact} · {o.channel} · {o.reason} ·{" "}
                {relativeDay(o.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
