"use client";

import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import { usePlatform } from "@/hooks/use-platform";
import { relativeDay } from "@/lib/client-format";

export default function InboxPage() {
  const { data, loading, error, refresh } = usePlatform();

  async function patch(
    id: string,
    body: { read?: boolean; crmSynced?: boolean },
  ) {
    try {
      const res = await fetch(`/api/replies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      await refresh();
      if (body.crmSynced) toast.success("Marked synced to CRM (mock n8n)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  const brandName = (id: string) =>
    data.brands.find((b) => b.id === id)?.name || id;

  return (
    <div>
      <PageHeader
        title="Reply inbox"
        description="Watch replies in real time. Interested replies should create CRM contacts via n8n — mocked here until the connector is wired."
      />

      {data.replies.length === 0 ? (
        <EmptyPanel
          title="Inbox is quiet"
          description="When campaigns send, replies land here for triage."
        />
      ) : (
        <div className="space-y-3 animate-rise">
          {data.replies.map((reply) => (
            <article
              key={reply.id}
              className={`rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 ${
                reply.read ? "opacity-80" : "shadow-sm"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{reply.from}</h2>
                    <StatusPill status={reply.sentiment} />
                    {!reply.read ? (
                      <span className="rounded-md bg-[color:var(--accent-soft)] px-2 py-0.5 text-xs text-[color:var(--ink)]">
                        Unread
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
                    {brandName(reply.brandId)} · {reply.channel.toUpperCase()} ·{" "}
                    {relativeDay(reply.createdAt)}
                    {reply.crmSynced ? " · CRM synced" : ""}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[color:var(--ink-soft)]">
                    {reply.body}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!reply.read ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => patch(reply.id, { read: true })}
                    >
                      Mark read
                    </Button>
                  ) : null}
                  {reply.sentiment === "interested" && !reply.crmSynced ? (
                    <Button
                      size="sm"
                      onClick={() => patch(reply.id, { crmSynced: true, read: true })}
                    >
                      Push to CRM
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
