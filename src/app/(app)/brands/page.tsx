"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { usePlatform } from "@/hooks/use-platform";
import { compactNumber, crmLabel } from "@/lib/client-format";

export default function BrandsPage() {
  const { data, loading, error, refresh } = usePlatform();

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  return (
    <div>
      <PageHeader
        title="Brand workspaces"
        description="Five brand slots. Pilot Brand 1 first — domain auth, 10DLC, numbers, CRM — then clone the pattern."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.brands.map((brand, index) => {
          const campaigns = data.campaigns.filter((c) => c.brandId === brand.id)
            .length;
          const assigned = data.leads.filter((l) => l.brandId === brand.id).length;
          return (
            <Link
              key={brand.id}
              href={`/brands/${brand.id}`}
              className={`rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 transition-transform hover:-translate-y-0.5 hover:shadow-sm animate-rise${index ? `-delay-${Math.min(index, 2)}` : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-2xl">
                    {brand.name}
                  </h2>
                  <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
                    {brand.domain}
                  </p>
                </div>
                <StatusPill status={brand.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[color:var(--ink-muted)]">CRM</dt>
                  <dd className="font-medium">{crmLabel(brand.crm)}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--ink-muted)]">Numbers</dt>
                  <dd className="font-medium">
                    {compactNumber(brand.phoneNumbers.length)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--ink-muted)]">Campaigns</dt>
                  <dd className="font-medium">{compactNumber(campaigns)}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--ink-muted)]">Assigned leads</dt>
                  <dd className="font-medium">{compactNumber(assigned)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusPill status={brand.tenDlcStatus} />
                <StatusPill status={brand.emailAuthStatus} />
              </div>
              <div className="mt-4 text-sm font-medium text-[color:var(--ink)]">
                Open workspace →
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
