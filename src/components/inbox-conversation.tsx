"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { InboxSend, Reply } from "@/lib/types";

type Conversation = { inbound: Reply[]; outbound: InboxSend[]; disabledReason?: string; from?: string; to: string };
const statuses: Record<InboxSend["status"], string> = {
  sending: "Awaiting confirmation — check before sending again",
  accepted: "Accepted for sending", delivered: "Delivered", failed: "Not sent", unknown: "Status unknown — check before sending again",
};

export function InboxConversation({ reply }: { reply: Reply }) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(false);
  const inFlight = useRef(false);
  const request = useRef<{ id: string; body: string; endpoint: string } | null>(null);
  const endpoint = `/api/replies/${encodeURIComponent(reply.id)}/conversation`;
  const refresh = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load conversation");
    setConversation(result);
  }, [endpoint]);
  useEffect(() => {
    let active = true;
    const load = () => { void refresh().catch((e) => { if (active) setError(e.message); }); };
    load(); const timer = setInterval(load, 15_000);
    return () => { active = false; clearInterval(timer); };
  }, [refresh]);

  async function send() {
    if (inFlight.current || !draft.trim()) return;
    inFlight.current = true; setSending(true); setError("");
    // Retain the same ID when the browser loses a response. A retry cannot send twice.
    request.current ||= { id: crypto.randomUUID(), body: draft.trim(), endpoint };
    setPendingRequest(true);
    try {
      const response = await fetch(request.current.endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: request.current.body, requestId: request.current.id }) });
      const result = await response.json();
      if (result.send) {
        const sent = result.send as InboxSend;
        if (["accepted", "delivered"].includes(sent.status)) setDraft("");
        else setError(sent.error || statuses[sent.status]);
        request.current = null;
        setPendingRequest(false);
        // Keep uncertain messages visible and prevent an accidental fresh request.
        if (["unknown", "sending"].includes(sent.status)) setDraft("");
        await refresh();
      } else {
        request.current = null;
        setPendingRequest(false);
        throw new Error(result.error || "Unable to send reply");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection interrupted. Retry to check the same send request.");
    } finally { inFlight.current = false; setSending(false); }
  }
  const history = [
    ...(conversation?.inbound || []).map((r) => ({ id: r.id, body: r.body, time: r.createdAt, label: r.from, status: "" })),
    ...(conversation?.outbound || []).map((s) => ({ id: s.id, body: s.body, time: s.createdAt,
      label: `You · ${s.from}`, status: `${statuses[s.status]}${s.error ? ` · ${s.error}` : ""}` })),
  ].sort((a, b) => a.time.localeCompare(b.time));
  return <section className="mt-4 space-y-3 border-t border-[color:var(--ink-border)] pt-4" aria-label="Conversation">
    <h3 className="text-sm font-medium">Conversation</h3>
    {!conversation && !error ? <p className="text-sm">Loading conversation…</p> : null}
    <div className="max-h-80 space-y-3 overflow-y-auto" aria-live="polite">
      {history.map((message) => <div key={message.id} className="rounded-lg border border-[color:var(--ink-border)] p-3 text-sm">
        <p className="text-xs text-[color:var(--ink-muted)]">{message.label} · {new Date(message.time).toLocaleString()}</p>
        <p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p>
        {message.status ? <p className="mt-1 text-xs text-[color:var(--ink-muted)]">{message.status}</p> : null}
      </div>)}
    </div>
    {conversation?.disabledReason ? <p className="text-sm text-[color:var(--ink-muted)]">{conversation.disabledReason}</p> : null}
    <label className="block space-y-2 text-sm">
      <span>Reply{conversation?.from ? ` from ${conversation.from} to ${conversation.to}` : ""}</span>
      <textarea className="min-h-28 w-full rounded-lg border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-3"
        value={draft} onChange={(e) => { if (!request.current) setDraft(e.target.value); }}
        maxLength={reply.channel === "sms" ? 1600 : 20_000} disabled={!conversation || Boolean(conversation.disabledReason) || sending || pendingRequest}
        placeholder="Write your reply…" />
    </label>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <Button size="sm" disabled={!conversation || Boolean(conversation.disabledReason) || sending || !draft.trim()} onClick={() => void send()}>
      {sending ? "Sending…" : pendingRequest ? "Check / retry request" : "Send reply"}
    </Button>
    <p className="text-xs text-[color:var(--ink-muted)]">Messages stay with this brand. Accepted for sending does not confirm delivery.</p>
  </section>;
}
