"use client";

import { useState } from "react";
import { ABSTRACT_PRIVACY_URL, SMS_DISCLOSURE, SMS_DISCLOSURE_VERSION } from "@/lib/sms-consent";
import { Button } from "@/components/ui/button";

export function AbstractSmsSignup() {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return <form className="space-y-5" onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/sms/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, consent, website, version: SMS_DISCLOSURE_VERSION }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save your choice");
      setMessage(result.message); setConsent(false); setPhone("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save your choice"); }
    finally { setBusy(false); }
  }}>
    <label className="block space-y-2"><span>Mobile phone number</span>
      <input type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={25} className="w-full rounded-lg border border-[color:var(--ink-border)] p-3" />
    </label>
    <label className="flex items-start gap-3 text-sm leading-6">
      <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1" />
      <span>{SMS_DISCLOSURE} <a className="underline" href="#sms-terms">SMS Terms</a> · <a className="underline" href="#sms-privacy">SMS Privacy</a> · <a className="underline" href={ABSTRACT_PRIVACY_URL}>Abstract Capital Group Privacy Policy</a></span>
    </label>
    <label className="hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
    <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Submit my choice"}</Button>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </form>;
}
