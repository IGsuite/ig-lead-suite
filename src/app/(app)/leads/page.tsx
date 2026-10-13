"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [costDollars, setCostDollars] = useState("250");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.leads;
    return data.leads.filter((lead) =>
      [
        lead.firstName,
        lead.lastName,
        lead.email,
        lead.phone,
        lead.source,
        lead.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data, query]);

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
      form.set("purchaseDate", purchaseDate);
      form.set("costDollars", costDollars);
      const res = await fetch("/api/leads/upload", { method: "POST", body: form });
      const json = (await res.json()) as {
        error?: string;
        importedCount?: number;
        duplicateCount?: number;
      };
      if (!res.ok) throw new Error(json.error || "Upload failed");
      toast.success(
        `Imported ${json.importedCount} leads · removed ${json.duplicateCount} duplicates`,
      );
      setFile(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <LoadingPanel label="Loading lead pool…" />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  return (
    <div>
      <PageHeader
        title="Shared lead pool"
        description="Upload once. These contacts can rotate through Abstract, Ahava, Take More, Venture, and TYH offers. Duplicates and global opt-outs are stripped on import."
      />

      <form
        onSubmit={onUpload}
        className="mb-6 grid gap-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise md:grid-cols-2 xl:grid-cols-5"
      >
        <div className="space-y-2 xl:col-span-1">
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
        <div className="space-y-2 xl:col-span-1">
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
        <p className="text-xs text-[color:var(--ink-muted)] md:col-span-2 xl:col-span-5">
          Expected columns (flexible names): email, phone, first_name, last_name.{" "}
          <a className="underline underline-offset-2" href="/sample-leads.csv">
            Download sample CSV
          </a>
          .
        </p>
      </form>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, phone, source…"
          className="max-w-md"
        />
        <p className="text-sm text-[color:var(--ink-muted)]">
          Showing {compactNumber(filtered.length)} of{" "}
          {compactNumber(data.leads.length)} leads
        </p>
      </div>

      {data.uploads.length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {data.uploads.slice(0, 4).map((batch) => (
            <div
              key={batch.id}
              className="rounded-full border border-[color:var(--ink-border)] bg-[color:var(--panel)] px-3 py-1 text-xs text-[color:var(--ink-soft)]"
            >
              {batch.filename} · {batch.source} · +{batch.importedCount} / −
              {batch.duplicateCount} · {money(batch.costCents)}
            </div>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyPanel
          title="No leads match"
          description="Upload a provider CSV or clear the search to see the pool."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise-delay-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Offered to</TableHead>
                <TableHead>Purchased</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 100).map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <div className="font-medium">
                      {[lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
                        "Unknown"}
                    </div>
                    <div className="text-xs text-[color:var(--ink-muted)]">
                      {lead.email || "—"} · {lead.phone || "—"}
                    </div>
                  </TableCell>
                  <TableCell>{lead.source}</TableCell>
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
                  <TableCell>{money(lead.costCents)}</TableCell>
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
