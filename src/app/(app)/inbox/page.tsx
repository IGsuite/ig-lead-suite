"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { InboxConversation } from "@/components/inbox-conversation";
import { conversationKey } from "@/lib/conversation-key";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlatform } from "@/hooks/use-platform";
import { relativeDay } from "@/lib/client-format";
import type { ReplySentiment } from "@/lib/types";
import { cn } from "@/lib/utils";

function InboxInner() {
  const { data, loading, error, refresh } = usePlatform();
  const searchParams = useSearchParams();
  const [entityId, setEntityId] = useState(
    searchParams.get("entity") || searchParams.get("brandId") || "abstract",
  );
  const leadIdFilter = searchParams.get("leadId") || "";
  const [openReply, setOpenReply] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => { void refresh(); }, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);
  const channelFilter = searchParams.get("channel") === "sms" ? "sms" : "email";
  function channelHref(channel: "email" | "sms") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("entity", entityId);
    params.set("channel", channel);
    return `/inbox?${params.toString()}`;
  }
  const [statusFilter, setStatusFilter] = useState<
    "all" | "unread" | "interested" | "forwarded"
  >("all");

  const replies = useMemo(() => {
    if (!data) return [];
    return data.replies.filter((reply) => {
      if (reply.brandId !== entityId) return false;
      if (leadIdFilter && reply.leadId !== leadIdFilter) return false;
      if (reply.channel !== channelFilter) return false;
      if (statusFilter === "unread" && reply.read) return false;
      if (statusFilter === "interested" && reply.sentiment !== "interested")
        return false;
      if (statusFilter === "forwarded" && !reply.manualForwarded) return false;
      return true;
    });
  }, [data, entityId, channelFilter, statusFilter, leadIdFilter]);

  async function patch(
    id: string,
    body: {
      read?: boolean;
      crmSynced?: boolean;
      sentiment?: ReplySentiment;
      manualForwarded?: boolean;
    },
  ) {
    try {
      const res = await fetch(`/api/replies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      await refresh();
      if (body.manualForwarded) toast.success("Marked as manually forwarded");
      else if (body.sentiment === "interested")
        toast.success("Marked interested — ready to forward");
      else if (body.crmSynced)
        toast.success("Queued for CRM (manual flag — API later)");
      else if (body.read) toast.success("Marked read");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  function forwardMailto(replyId: string) {
    if (!data) return;
    const reply = data.replies.find((r) => r.id === replyId);
    const brand = data.brands.find((b) => b.id === entityId);
    const lead = reply ? data.leads.find((l) => l.id === reply.leadId) : null;
    const campaign = reply
      ? data.campaigns.find((c) => c.id === reply.campaignId)
      : null;
    if (!reply || !brand) return;

    const subject = encodeURIComponent(
      `[${brand.shortName}] Good lead — ${lead?.firstName || reply.from}`,
    );
    const body = encodeURIComponent(
      [
        `Entity: ${brand.name}`,
        `Campaign: ${campaign?.name || reply.campaignId}`,
        `Channel: ${reply.channel.toUpperCase()}`,
        `From: ${reply.from}`,
        `Name: ${[lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || "—"}`,
        `Email: ${lead?.email || "—"}`,
        `Phone: ${lead?.phone || "—"}`,
        `Source: ${lead?.source || "—"} / ${lead?.groupName || "—"}`,
        "",
        "Reply:",
        reply.body,
        "",
        "— forwarded from IG Lead Suite (manual triage)",
      ].join("\n"),
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    void patch(replyId, {
      manualForwarded: true,
      read: true,
      sentiment: reply.sentiment === "other" ? "interested" : reply.sentiment,
    });
  }

  if (loading && !data) return <LoadingPanel label="Loading inbox…" />;
  if (!data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  const brand = data.brands.find((b) => b.id === entityId);
  const unread = data.replies.filter(
    (r) => r.brandId === entityId && r.channel === channelFilter && !r.read,
  ).length;

  return (
    <div>
      <PageHeader
        title={channelFilter === "email" ? "Email inbox" : "Text inbox"}
        description={channelFilter === "email"
          ? "Read and reply to email conversations for this business."
          : "Read and reply to text conversations for this business."}
        actions={
          <Link
            href={`/campaigns?brandId=${entityId}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {brand?.shortName} campaigns
          </Link>
        }
      />

      <div className="mb-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 text-sm text-[color:var(--ink-soft)] animate-rise">
        <strong>How replies work:</strong> people text/email back to the number
        or mailbox that sent them. That inbound message hits this entity’s inbox
        for that brand. Open the conversation to respond here, or use <em>Email team</em> to forward it.
        {leadIdFilter ? (
          <>
            {" "}
            Showing one lead —{" "}
            <Link
              href={`/leads/${leadIdFilter}`}
              className="underline underline-offset-2"
            >
              open full lead page
            </Link>
            .
          </>
        ) : null}
      </div>

      <nav aria-label="Inbox channel" className="mb-4 flex gap-2">
        {(["email", "sms"] as const).map((channel) => (
          <Link key={channel} href={channelHref(channel)}
            aria-current={channelFilter === channel ? "page" : undefined}
            className={cn(buttonVariants({ variant: channelFilter === channel ? "default" : "outline" }))}>
            {channel === "email" ? "Email inbox" : "Text inbox"}
          </Link>
        ))}
      </nav>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 animate-rise">
        <div className="space-y-2">
          <label className="text-sm font-medium">Entity portal</label>
          <Select
            value={entityId}
            onValueChange={(value) => {
              if (value) setEntityId(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Filter</label>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              if (value) setStatusFilter(value as typeof statusFilter);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({unread} unread)</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="interested">Interested</SelectItem>
              <SelectItem value="forwarded">Manually forwarded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {replies.length === 0 ? (
        <EmptyPanel
          title={`No ${brand?.shortName || "entity"} ${channelFilter === "email" ? "email" : "text"} replies`}
          description={channelFilter === "email"
            ? "Replies to this business’s email address appear here. Open a conversation to respond."
            : "Replies to this business’s text number appear here once text receiving is connected. Open a conversation to respond."}
        />
      ) : (
        <div className="space-y-3 animate-rise-delay-1">
          {replies.filter((reply, index, all) => all.findIndex((r) => conversationKey(r) === conversationKey(reply)) === index).map((reply) => {
            const lead = data.leads.find((l) => l.id === reply.leadId);
            const campaign = data.campaigns.find(
              (c) => c.id === reply.campaignId,
            );
            return (
              <article
                key={conversationKey(reply)}
                className={`rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 ${
                  reply.read ? "opacity-85" : "shadow-sm"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">
                        {[lead?.firstName, lead?.lastName]
                          .filter(Boolean)
                          .join(" ") || reply.from}
                      </h2>
                      <StatusPill status={reply.sentiment} />
                      <span className="rounded-md border border-[color:var(--ink-border)] px-2 py-0.5 text-xs uppercase">
                        {reply.channel}
                      </span>
                      {!reply.read ? (
                        <span className="rounded-md bg-[color:var(--accent-soft)] px-2 py-0.5 text-xs">
                          Unread
                        </span>
                      ) : null}
                      {reply.manualForwarded ? (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900">
                          Forwarded
                        </span>
                      ) : null}
                      {reply.crmSynced ? (
                        <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs text-sky-950">
                          CRM queued
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
                      {brand?.shortName} · {reply.from} ·{" "}
                      {campaign?.name || "Campaign"} ·{" "}
                      {relativeDay(reply.createdAt)}
                      {lead
                        ? ` · ${lead.source} / ${lead.groupName}`
                        : ""}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[color:var(--ink-soft)]">
                      {reply.body}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                    <Button size="sm" variant="outline" onClick={() => setOpenReply(openReply === conversationKey(reply) ? null : conversationKey(reply))}>
                      {openReply === conversationKey(reply) ? "Close conversation" : "Open conversation / reply"}
                    </Button>
                    {reply.sentiment !== "interested" ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          patch(reply.id, {
                            sentiment: "interested",
                            read: true,
                          })
                        }
                      >
                        Good lead
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => forwardMailto(reply.id)}
                    >
                      Email team
                    </Button>
                    {!reply.crmSynced ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          patch(reply.id, {
                            crmSynced: true,
                            read: true,
                            sentiment: "interested",
                          })
                        }
                      >
                        Queue CRM later
                      </Button>
                    ) : null}
                    {reply.sentiment !== "not_interested" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          patch(reply.id, {
                            sentiment: "not_interested",
                            read: true,
                          })
                        }
                      >
                        Not interested
                      </Button>
                    ) : null}
                    {reply.sentiment !== "opt_out" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          patch(reply.id, {
                            sentiment: "opt_out",
                            read: true,
                          })
                        }
                      >
                        Opt out
                      </Button>
                    ) : null}
                    {!reply.read ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => patch(reply.id, { read: true })}
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
                {openReply === conversationKey(reply) ? <InboxConversation reply={reply} /> : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading inbox…" />}>
      <InboxInner />
    </Suspense>
  );
}
