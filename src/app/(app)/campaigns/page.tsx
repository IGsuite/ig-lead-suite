"use client";

import Link from "next/link";
import { toast } from "sonner";
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
import { usePlatform } from "@/hooks/use-platform";
import { compactNumber, relativeDay } from "@/lib/client-format";
import { cn } from "@/lib/utils";

export default function CampaignsPage() {
  const { data, loading, error, refresh } = usePlatform();

  async function launch(id: string) {
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "launch", id }),
      });
      if (!res.ok) throw new Error("Could not launch campaign");
      toast.success("Campaign launched with throttle settings applied (mock send)");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Launch failed");
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
        title="Campaigns"
        description="Pick audience → write message → set volume → send with throttling. Opted-out contacts are excluded automatically."
        actions={
          <Link href="/campaigns/new" className={cn(buttonVariants())}>
            Build campaign
          </Link>
        }
      />

      {data.campaigns.length === 0 ? (
        <EmptyPanel
          title="No campaigns yet"
          description="Create your first Brand 1 warm-up or live send."
          action={
            <Link href="/campaigns/new" className={cn(buttonVariants())}>
              Build campaign
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div className="font-medium">{campaign.name}</div>
                    <div className="text-xs text-[color:var(--ink-muted)]">
                      {relativeDay(campaign.createdAt)} · throttle{" "}
                      {campaign.throttlePerHour}/hr
                    </div>
                  </TableCell>
                  <TableCell>{brandName(campaign.brandId)}</TableCell>
                  <TableCell className="uppercase">{campaign.channel}</TableCell>
                  <TableCell>
                    {compactNumber(campaign.sentCount)} /{" "}
                    {compactNumber(campaign.volume)}
                    <div className="text-xs text-[color:var(--ink-muted)]">
                      {compactNumber(campaign.replyCount)} replies ·{" "}
                      {compactNumber(campaign.optOutCount)} opt-outs
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={campaign.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {campaign.status === "draft" || campaign.status === "scheduled" ? (
                      <Button size="sm" onClick={() => launch(campaign.id)}>
                        Launch
                      </Button>
                    ) : (
                      <Link
                        href="/inbox"
                        className={cn(
                          buttonVariants({ size: "sm", variant: "ghost" }),
                        )}
                      >
                        Inbox
                      </Link>
                    )}
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
