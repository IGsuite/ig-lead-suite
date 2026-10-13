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
        title="Entity portals"
        description="Abstract, Ahava, Take More, Venture, and TYH each get their own workspace — site, sending domain, numbers, CRM, website API — while leads stay in one shared pool."
      />
      <div className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 text-sm text-[color:var(--ink-soft)] animate-rise">
        Rotation order:{" "}
        <strong>
          {data.rotation.entityOrder
            .map((id) => data.brands.find((b) => b.id === id)?.shortName || id)
            .join(" → ")}
        </strong>
        . A lead can hear from more than one entity; they convert with whichever
        offer fits.
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.brands.map((brand) => {
          const campaigns = data.campaigns.filter((c) => c.brandId === brand.id)
            .length;
          const offered = data.leads.filter((l) =>
            l.offeredEntityIds.includes(brand.id),
          ).length;
          const open = data.leads.filter(
            (l) =>
              !l.optedOut &&
              l.status !== "converted" &&
              !l.offeredEntityIds.includes(brand.id),
          ).length;
          return (
            <Link
              key={brand.id}
              href={`/brands/${brand.id}`}
              className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 transition-transform hover:-translate-y-0.5 hover:shadow-sm animate-rise"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-2xl">
                    {brand.name}
                  </h2>
                  <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
                    {brand.focus}
                  </p>
                </div>
                <StatusPill status={brand.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {brand.programs.map((program) => (
                  <span
                    key={program}
                    className="rounded-md bg-[color:var(--panel-hover)] px-2 py-0.5 text-xs text-[color:var(--ink-soft)]"
                  >
                    {program}
                  </span>
                ))}
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
                  <dt className="text-[color:var(--ink-muted)]">Open for offer</dt>
                  <dd className="font-medium">{compactNumber(open)}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--ink-muted)]">Already offered</dt>
                  <dd className="font-medium">{compactNumber(offered)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusPill status={brand.tenDlcStatus} />
                <StatusPill status={brand.emailAuthStatus} />
                {brand.rotationEnabled ? (
                  <span className="rounded-md border border-[color:var(--ink-border)] bg-[color:var(--accent-soft)]/50 px-2 py-0.5 text-xs">
                    Rotation on
                  </span>
                ) : null}
              </div>
              <div className="mt-4 text-sm font-medium text-[color:var(--ink)]">
                Open {brand.shortName} portal →
              </div>
              <div className="mt-1 text-xs text-[color:var(--ink-muted)]">
                {compactNumber(campaigns)} campaigns ·{" "}
                <span className="underline underline-offset-2">
                  {brand.websiteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
