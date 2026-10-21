"use client";
import {ManualLeadPackages} from "@/components/manual-lead-packages";
import {listManualPackages,manualPackageSource} from "@/lib/manual-packages";
import { uploadFileToApi } from "@/lib/upload-client";

import Link from "next/link";
import { useLeadDirectory } from "@/hooks/use-lead-directory";
import { LeadImportProgress } from "@/components/lead-import-progress";
import { useState } from "react";
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
  const { data, loading, error, refresh: refreshPlatform } = usePlatform({ omitLeads: true });
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
  const [addOpen, setAddOpen] = useState(false);
  const [packageFilter,setPackageFilter] = useState("all");
  const directory = useLeadDirectory(query,groupFilter,packageFilter,verifyFilter);
  const [importRevision,setImportRevision] = useState(0);
  async function refresh(){await Promise.all([refreshPlatform(),directory.refresh()]);}

  const groups = directory.data?.groups || [];
  const verifyStats = directory.data?.stats || {unverified:0,valid:0,invalid:0,suppressed:0};
  const filtered = directory.data?.leads || data?.leads || [];
  const totalLeads = directory.data?.total ?? data?.leads.length ?? 0;
  const packages = directory.data?.packages || listManualPackages(data?.leads||[]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Choose a CSV or Excel (.xlsx) file first");
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
      const res = await uploadFileToApi("/api/leads/imports", form);
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        job?: {id:string};
        importedCount?: number;
        duplicateCount?: number;
        skippedEmpty?: number;
        skippedInvalid?: number;
        verifiedOnImport?: { valid?: number; invalid?: number; risky?: number };
      };
      if (!res.ok) throw new Error(json.error || "Upload failed");
      if(json.job){setImportRevision(v=>v+1);setFile(null);toast.success("File uploaded. Background import started; no campaign launched.");await directory.refresh();return;}
      const skipBits = [
        json.skippedEmpty
          ? `${json.skippedEmpty} missing email/phone`
          : null,
        json.skippedInvalid
          ? `${json.skippedInvalid} invalid contact`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      if ((json.importedCount ?? 0) === 0) {
        toast.message(
          `No new leads imported · ${json.duplicateCount ?? 0} duplicates` +
            (skipBits ? ` · ${skipBits}` : ""),
        );
      } else {
        const v = json.verifiedOnImport;
        toast.success(
          `Imported ${json.importedCount} into ${groupName} · ${json.duplicateCount ?? 0} duplicates` +
            (skipBits ? ` · skipped ${skipBits}` : "") +
            ` · verified ${v?.valid ?? 0} valid / ${v?.risky ?? 0} risky / ${v?.invalid ?? 0} invalid`,
        );
      }
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
        body: JSON.stringify({ onlyUnverified, leadIds: filtered.map(l=>l.id) }),
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

  function openAddLead(){setAddOpen(true);}

  if (loading) return <LoadingPanel label="Loading lead pool…" />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Shared pool for every entity. Upload once, verify contacts, then Autopilot rotates offers through each portal — never mixing brands. Click a lead for the full history page."
      />

      <section className="mb-5 rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">Manual lead packages</h2><p className="mt-1 text-sm text-[color:var(--ink-muted)]">Keep each hand-picked audience in its own folder. Select its package under campaign audience sources.</p></div><Button variant="outline" onClick={openAddLead}>Add one or multiple contacts</Button></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant={packageFilter==="all"?"default":"outline"} onClick={()=>setPackageFilter("all")}>All leads</Button>{packages.map(p=><div key={p.id} className="flex items-center gap-2 rounded-md border border-[color:var(--ink-border)] p-1"><Button size="sm" variant={packageFilter===manualPackageSource(p.id)?"default":"outline"} onClick={()=>{setPackageFilter(manualPackageSource(p.id));setGroupFilter("all");setVerifyFilter("all");setQuery("");}}>{p.name} ({p.count}) · {p.id.slice(0,8)}</Button><Link className="px-2 text-xs underline" href={`/campaigns/new?brandId=abstract&channel=email&source=${encodeURIComponent(manualPackageSource(p.id))}`}>Use in campaign</Link></div>)}</div></section>

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
          <p className="text-[11px] text-[color:var(--ink-muted)]">
            Required for reporting. Overrides file source columns.
          </p>
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
          <Label htmlFor="file">CSV or Excel file</Label>
          <Input
            id="file"
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" className="flex-1" disabled={uploading}>
            {uploading ? "Importing…" : "Import file"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={openAddLead}
          >
            Add lead
          </Button>
        </div>
        <p className="text-xs text-[color:var(--ink-muted)] md:col-span-2 xl:col-span-6">
          <strong className="text-[color:var(--ink)]">What matters:</strong>{" "}
          CSV imports support up to <strong>1,000,000 rows / 200 MB</strong> per file with background processing and resumable checkpoints. Excel (.xlsx / .xls, first sheet) supports up to 20 MB and 5 million cells; export larger workbooks as CSV. Headers auto-map email, phone, names, and business name; extra fields are ignored. A contact with a usable email stays available for email even if its phone is invalid. Records with no usable channel appear under Junk. Local format checks do not prove deliverability or SMS consent.{" "}
          <a className="underline underline-offset-2" href="/sample-leads.csv">
            Download sample CSV
          </a>
          . Or use <strong>Add lead</strong> for a single contact.
        </p>
      </form>

      <LeadImportProgress revision={importRevision} onChange={directory.refresh}/>
      <ManualLeadPackages open={addOpen} onOpenChange={setAddOpen} leads={filtered} packageCatalog={packages} onSaved={refresh}/>



      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5 animate-rise-delay-1">
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">In pool</div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {compactNumber(totalLeads)}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">Needs review</div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {compactNumber(verifyStats.unverified)}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">Format ready</div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {compactNumber(verifyStats.valid)}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
          <div className="text-xs text-[color:var(--ink-muted)]">Suppressed</div>
          <div className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {compactNumber(verifyStats.suppressed)}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 sm:col-span-2 xl:col-span-1">
          <div className="text-xs text-[color:var(--ink-muted)]">Junk</div>
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
            placeholder="Search name, business, email, phone, source…"
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
                <SelectItem value="unverified">Needs verification / review</SelectItem>
                <SelectItem value="valid">Format ready</SelectItem>
                <SelectItem value="suppressed">Suppressed / opt-outs</SelectItem>
                <SelectItem value="invalid">Junk — no usable channel</SelectItem>
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
            {verifying ? "Verifying…" : "Check unverified on page"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={verifying}
            onClick={() => void onVerify(false)}
          >
            Re-check this page
          </Button>
        </div>
      </div>

      <p className="mb-4 text-sm text-[color:var(--ink-muted)]">
        Showing {compactNumber(filtered.length)} on page {directory.page} · {compactNumber(directory.data?.filteredCount??totalLeads)} matching / {compactNumber(totalLeads)} total. Format-ready is a local check; delivery verification is separate.
      </p>
      {directory.error?<p role="alert" className="mb-3 text-sm text-red-700">{directory.error}</p>:null}
      <div className="mb-4 flex items-center gap-3"><Button variant="outline" disabled={directory.page===1||directory.loading} onClick={directory.previous}>Previous</Button><span className="text-sm">Page {directory.page}{directory.loading?" · loading…":""}</span><Button variant="outline" disabled={!directory.data?.nextCursor||directory.loading} onClick={directory.next}>Next 100</Button></div>

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
          title={totalLeads === 0 ? "No leads in the pool yet" : "No leads match"}
          description={
            totalLeads === 0
              ? "Import a provider CSV or Excel file, or use Add lead to start the shared pool. Then verify and launch campaigns."
              : "Clear filters, upload another CSV/Excel file, or add a lead to see contacts in the shared pool."
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
                      {lead.businessName ? `${lead.businessName} · ` : ""}
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
