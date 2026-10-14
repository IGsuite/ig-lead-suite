"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
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

function CampaignsInner() {
  const { data, loading, error, refresh } = usePlatform();
  const searchParams = useSearchParams();
  const [entityId, setEntityId] = useState(
    searchParams.get("brandId") || searchParams.get("entity") || "abstract",
  );

  const campaigns = useMemo(() => {
    if (!data) return [];
    return data.campaigns.filter((c) => c.brandId === entityId);
  }, [data, entityId]);

  async function launch(id: string) {
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "launch", id }),
      });
      if (!res.ok) throw new Error("Could not launch campaign");
      toast.success("Campaign launched — SMS via Telnyx (live or mock)");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Launch failed");
    }
  }

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  const brand = data.brands.find((b) => b.id === entityId);

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Each entity runs its own campaigns only. Ahava never sends under Abstract — pick a portal, then build or launch."
        actions={
          <Link
            href={`/campaigns/new?brandId=${entityId}`}
            className={cn(buttonVariants())}
          >
            Build for {brand?.shortName || "entity"}
          </Link>
        }
      />

      <div className="mb-6 max-w-sm space-y-2 animate-rise">
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
        <p className="text-xs text-[color:var(--ink-muted)]">
          Showing only {brand?.name || "this entity"} campaigns. Other brands are
          hidden so nothing mixes.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyPanel
          title={`No ${brand?.shortName || "entity"} campaigns`}
          description="Create a campaign for this portal. Audience still comes from the shared pool, but the offer and send identity stay here."
          action={
            <Link
              href={`/campaigns/new?brandId=${entityId}`}
              className={cn(buttonVariants())}
            >
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
                <TableHead>Channel</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div className="font-medium">{campaign.name}</div>
                    <div className="text-xs text-[color:var(--ink-muted)]">
                      {relativeDay(campaign.createdAt)} · throttle{" "}
                      {campaign.throttlePerHour}/hr ·{" "}
                      {brand?.shortName}
                    </div>
                  </TableCell>
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
                    {campaign.status === "draft" ||
                    campaign.status === "scheduled" ? (
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

export default function CampaignsPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <CampaignsInner />
    </Suspense>
  );
}
