"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SocialView from "./social-view.min.js";
import { SearchMarketingWorkspace } from "@/components/search-marketing-workspace";
import { LoadingPanel } from "@/components/state-panels";
import { isSearchPlatform } from "@/lib/marketing-platforms";
import { MetaReportingWorkspace } from "@/components/meta-reporting-workspace";

function MarketingWorkspace() {
  const params = useSearchParams();
  const channel = params.get("platform");
  const entity = params.get("entity") || params.get("brandId") || "";
  const activeChannel = channel === "meta_reporting" ? channel : isSearchPlatform(channel) ? channel : "social";
  return <>
    <nav aria-label="Marketing channels" className="mb-5 flex flex-wrap gap-2">
      {[["social", "Social media"], ["seo", "SEO"], ["google_ads", "Google Ads"], ["meta_reporting", "Meta reporting"]].map(([id, label]) => <Link key={id} aria-current={activeChannel === id ? "page" : undefined} className="rounded-md border border-[color:var(--ink-border)] px-4 py-2 text-sm aria-[current=page]:bg-[color:var(--ink)] aria-[current=page]:text-[color:var(--panel)]" href={`/social?entity=${encodeURIComponent(entity)}${id === "social" ? "" : `&platform=${id}`}`}>{label}</Link>)}
    </nav>
    {channel === "meta_reporting" ? <MetaReportingWorkspace key={entity || "abstract"} entityId={entity || "abstract"} /> : isSearchPlatform(channel) ? <SearchMarketingWorkspace key={`${entity}:${channel}`} platform={channel} initialEntity={entity} /> : <SocialView />}
  </>;
}
export default function SocialPage() { return <Suspense fallback={<LoadingPanel />}><MarketingWorkspace /></Suspense>; }
