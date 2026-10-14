"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
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
import { relativeDay } from "@/lib/client-format";
import type { OptOut } from "@/lib/types";

export default function OptOutsPage() {
  const { data, loading, error, refresh } = usePlatform();
  const [contact, setContact] = useState("");
  const [channel, setChannel] = useState<OptOut["channel"]>("both");
  const [reason, setReason] = useState("Manual suppression");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/opt-outs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact, channel, reason }),
      });
      if (!res.ok) throw new Error("Could not add opt-out");
      toast.success("Global opt-out saved — blocked across all entities & channels");
      setContact("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  return (
    <div>
      <PageHeader
        title="Global opt-outs"
        description="STOP texts and unsubscribe clicks block the contact everywhere. Manual suppressions work the same way."
      />

      <p className="mb-4 rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-900 animate-rise">
        <strong>Global opt-out</strong> blocks the person across{" "}
        <strong>all entities and channels</strong> — SMS and email for Abstract,
        Ahava, Take More, Venture, TYH, and every other portal. Autopilot and Own
        campaigns both respect this list.
      </p>

      <form
        onSubmit={onSubmit}
        className="mb-6 grid gap-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 md:grid-cols-4 animate-rise"
      >
        <div className="space-y-2 md:col-span-1">
          <Label>Email or phone</Label>
          <Input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="+15551234567"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Channel</Label>
          <Select
            value={channel}
            onValueChange={(value) => setChannel(value as OptOut["channel"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Both</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Suppress contact"}
          </Button>
        </div>
      </form>

      {data.optOuts.length === 0 ? (
        <EmptyPanel
          title="No suppressions yet"
          description="Opt-outs from STOP/unsubscribe will appear here automatically."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise-delay-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.optOuts.map((opt) => (
                <TableRow key={opt.id}>
                  <TableCell className="font-medium">{opt.contact}</TableCell>
                  <TableCell className="uppercase">{opt.channel}</TableCell>
                  <TableCell>{opt.reason}</TableCell>
                  <TableCell>{relativeDay(opt.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
