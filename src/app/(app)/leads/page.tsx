"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlatform } from "@/hooks/use-platform";
import { compactNumber, money, relativeDay } from "@/lib/client-format";

export default function LeadsPage() {
  const { data, loading, error, refresh } = usePlatform();
  const [source, setSource] = useState("LeadForge");
  const [groupName, setGroupName] = useState("Week 13 file");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [costDollars, setCostDollars] = useState("250");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [verifyFilter, setVerifyFilter] = useState("all");

  const groups = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.leads.map((l) => l.groupName))).sort();
  }, [data]);

  const verifyStats = useMemo(() => {
    if (!data) return { unverified: 0, valid: 0, invalid: 0, risky: 0 };
    return data.leads.reduce(
      (acc, lead) => {
        const worst =
          lead.emailStatus === "invalid" || lead.phoneStatus === "invalid"
            ? "invalid"
            : lead.emailStatus === "risky" || lead.phoneStatus === "risky"
              ? "risky"
              : lead.emailStatus === "unverified" &&
                  lead.phoneStatus === "unverified"
                ? "unverified"
                : lead.emailStatus === "valid" || lead.phoneStatus === "valid"
                  ? "valid"
                  : "unverified";
        acc[worst] += 1;
        return acc;
      },
      { unverified: 0, valid: 0, invalid: 0, risky: 0 },
    );
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.leads.filter((lead) => {
      if (groupFilter !== "all" && lead.groupName !== groupFilter) return false;
      if (verifyFilter === "unverified") {
        if (
          lead.emailStatus !== "unverified" &&
          lead.phoneStatus !== "unverified"
        )
          return false;
      } else if (verifyFilter === "invalid") {
        if (
          lead.emailStatus !== "invalid" &&
          lead.phoneStatus !== "invalid"
        )
          return false;
      } else if (verifyFilter === "valid") {
        if (
          lead.emailStatus !== "valid" &&
          lead.phoneStatus !== "valid"
        )
          return false;
      } else if (verifyFilter === "risky") {
        if (lead.emailStatus !== "risky" && lead.phoneStatus !== "risky")
          return false;
      }
      if (!q) return true;
      return [
        lead.firstName,
        lead.lastName,
        lead.email,
        lead.phone,
        lead.source,
        lead.groupName,
        lead.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, query, groupFilter, verifyFilter]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Choose a CSV file first");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("source", source);
      form.set("groupName", groupName);
      form.set("purchaseDate", purchaseDate);
      form.set("costDollars", costDollars);
      const res = await fetch("/api/leads/upload", { method: "POST", body: form });
      const json = (await res.json()) as {
        error?: string;
        importedCount?: number;
        duplicateCount?: number;
        verifiedOnImport?: { valid?: number; invalid?: number; risky?: number };
      };
      if (!res.ok) throw new Error(json.error || "Upload failed");
      const v = json.verifiedOnImport;
      toast.success(
        `Imported ${json.importedCount} into ${groupName} · ${json.duplicateCount} duplicates removed · verified ${v?.valid ?? 0} valid / ${v?.risky ?? 0} risky / ${v?.invalid ?? 0} invalid`,
      );
      setFile(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onVerify(onlyUnverified = true) {
    setVerifying(true);
    try {
      const res = await fetch("/api/leads/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlyUnverified }),
      });
      const json = (await res.json()) as {
        error?: string;
        verified?: number;
        invalid?: number;
        risky?: number;
      };
      if (!res.ok) throw new Error(json.error || "Verify failed");
      const verified = json.verified ?? 0;
      const invalid = json.invalid ?? 0;
      const risky = json.risky ?? 0;
      const valid = Math.max(0, verified - invalid - risky);
      toast.success(
        `Checked ${verified} · ${valid} valid · ${risky} risky · ${invalid} invalid`,
      );
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setVerifying(false);
    }
  }

  if (loading) return <LoadingPanel label="Loading lead pool…" />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Shared pool for every entity. Upload once, verify contacts, then Autopilot rotates offers through each portal — never mixing brands. Click a lead for the full history page."
      />

      <p className="mb-4 rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] px-4 py-3 text-sm text-[color:var(--ink-soft)] animate-rise">
        <strong className="text-[color:var(--ink)]">Global opt-out</strong>{" "}
        blocks a person across <strong>all entities and channels</strong> (SMS +
        email). Manage suppressions under Opt-outs.
      </p>

      <form
        onSubmit={onUpload}
        className="mb-6 grid gap-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise md:grid-cols-2 xl:grid-cols-6"
      >
        <div className="space-y-2">
          <Label htmlFor="source">Provider / source</Label>
          <Input
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="LeadForge"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="groupName">Group / list name</Label>
          <Input
            id="groupName"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Week 13 MCA file"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="purchaseDate">Purchase date</Label>
          <Input
            id="purchaseDate"
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cost">File cost (USD)</Label>
          <Input
            id="cost"
            type="number"
            min="0"
            step="0.01"
            value={costDollars}
            onChange={(e) => setCostDollars(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="file">CSV file</Label>
          <Input
            id="file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={uploading}>
            {uploading ? "Importing…" : "Import CSV"}
          </Button>
        </div>
        <p className="text-xs text-[color:var(--ink-muted)] md:col-span-2 xl:col-span-6">
          Tag each buy with a source (provider) and a group (which file). On
          import we automatically verify email + phone format so bad contacts
          don’t bounce. Expected columns: email, phone, first_name, last_name.{" "}
          <a className="underline underline-offset-2" href="/sample-leads.csv">
            Download sample CSV
          </a>
          .
        </p>
      </form>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5 animate-rise-delay-1">
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">In pool</div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {compactNumber(data.leads.length)}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">Unverified</div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {compactNumber(verifyStats.unverified)}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">Valid</div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {compactNumber(verifyStats.valid)}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">Risky</div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {compactNumber(verifyStats.risky)}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 sm:col-span-2 xl:col-span-1">
          <div className="text-xs text-[color:var(--ink-muted)]">Invalid</div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {compactNumber(verifyStats.invalid)}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, phone, source, group…"
            className="max-w-md"
          />
          <div className="w-full sm:w-44">
            <Label className="mb-1.5 block text-xs">Group</Label>
            <Select
              value={groupFilter}
              onValueChange={(value) => {
                if (value) setGroupFilter(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-44">
            <Label className="mb-1.5 block text-xs">Verify status</Label>
            <Select
              value={verifyFilter}
              onValueChange={(value) => {
                if (value) setVerifyFilter(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
                <SelectItem value="valid">Valid</SelectItem>
                <SelectItem value="risky">Risky</SelectItem>
                <SelectItem value="invalid">Invalid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={verifying}
            onClick={() => void onVerify(true)}
          >
            {verifying ? "Verifying…" : "Verify unverified"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={verifying}
            onClick={() => void onVerify(false)}
          >
            Re-check all
          </Button>
        </div>
      </div>

      <p className="mb-4 text-sm text-[color:var(--ink-muted)]">
        Showing {compactNumber(filtered.length)} of{" "}
        {compactNumber(data.leads.length)} leads · local format checks now;
        NeverBounce / Telnyx number lookup can plug in later.
      </p>

      {data.uploads.length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {data.uploads.slice(0, 6).map((batch) => (
            <div
              key={batch.id}
              className="rounded-full border border-[color:var(--ink-border)] bg-[color:var(--panel)] px-3 py-1 text-xs text-[color:var(--ink-soft)]"
            >
              {batch.filename} · {batch.source} / {batch.groupName} · +
              {batch.importedCount} / −{batch.duplicateCount} ·{" "}
              {money(batch.costCents)}
            </div>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyPanel
          title={data.leads.length === 0 ? "No leads in the pool yet" : "No leads match"}
          description={
            data.leads.length === 0
              ? "Import a provider CSV above to start the shared pool. Then verify and launch campaigns."
              : "Clear filters or upload another CSV to see contacts in the shared pool."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise-delay-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Source / group</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Offered to</TableHead>
                <TableHead>Purchased</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 100).map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {[lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
                        "Unknown"}
                    </Link>
                    <div className="text-xs text-[color:var(--ink-muted)]">
                      {lead.email || "—"} · {lead.phone || "—"}
                    </div>
                    {lead.optedOut ? (
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-red-700">
                        Global opt-out · all entities & channels
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div>{lead.source}</div>
                    <div className="text-xs text-[color:var(--ink-muted)]">
                      {lead.groupName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={lead.emailStatus} />
                  </TableCell>
                  <TableCell>
                    <StatusPill status={lead.phoneStatus} />
                  </TableCell>
                  <TableCell>
                    {lead.offeredEntityIds.length === 0 ? (
                      <span className="text-xs text-[color:var(--ink-muted)]">
                        Fresh
                      </span>
                    ) : (
                      <span className="text-xs">
                        {lead.offeredEntityIds
                          .map(
                            (id) =>
                              data.brands.find((b) => b.id === id)?.shortName ||
                              id,
                          )
                          .join(", ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{relativeDay(lead.purchaseDate)}</TableCell>
                  <TableCell>
                    <StatusPill status={lead.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
