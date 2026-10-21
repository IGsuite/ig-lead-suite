"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { hasSmsMarketingConsent, readSmsConsents } from "@/lib/sms-consent";
import type { Brand, Lead } from "@/lib/types";

export function LeadSmsConsent({ lead, brands, onChange }: { lead: Lead; brands: Brand[]; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choices = readSmsConsents(lead.smsConsents);
  return <section className="mb-6 space-y-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
    <h2 className="font-[family-name:var(--font-display)] text-xl">Text marketing permission</h2>
    <p className="text-sm text-[color:var(--ink-muted)]">Permission belongs to one business and phone number. Adding a lead, verifying a number, or receiving a reply does not subscribe someone to marketing texts.</p>
    {brands.map(brand => {
      const records = choices.filter(c => c.brandId === brand.id);
      const eligible = hasSmsMarketingConsent(lead, brand.id);
      return <div key={brand.id} className="space-y-2 border-t border-[color:var(--ink-border)] pt-3 text-sm">
        <p><strong>{brand.shortName}:</strong> {eligible ? "SMS permission recorded" : "No current SMS marketing permission"}</p>
        {records.length ? <details><summary className="cursor-pointer">View permission history ({records.length})</summary>
          {records.toReversed().map(record => <div key={record.id} className="mt-3 space-y-1">
            <p>{record.status === "granted" ? "Opt-in recorded" : "Permission withdrawn"} · {new Date(record.recordedAt).toLocaleString()} · {record.phone}</p>
            <p>{record.disclosure}</p><p>Version: {record.disclosureVersion}</p><p className="break-all">Signup page: {record.sourceUrl}</p>
          </div>)}
        </details> : null}
        {eligible ? <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try {
            const response = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/sms-consent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "withdraw", brandId: brand.id }) });
            if (!response.ok) throw new Error("Could not withdraw permission");
            await onChange();
          } catch (e) { setError(e instanceof Error ? e.message : "Could not update permission"); }
          finally { setBusy(false); }
        }}>Withdraw SMS permission</Button> : null}
      </div>;
    })}
    <p className="text-sm">Abstract signup form: <a className="underline" href="/sms/abstract" target="_blank" rel="noreferrer">Open text preferences</a>. Permission does not activate sending or replace provider approval.</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </section>;
}
