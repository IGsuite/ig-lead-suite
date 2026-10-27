import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity } from "@/lib/acl";
import { getData, isNeonConfigured } from "@/lib/store";
import { getPrisma } from "@/lib/db";
import { setupCatalog, setupStatuses, type SetupStatus } from "@/lib/company-setup";
import { setupReadiness, type CompanyGoLive, type ReadinessCheck } from "@/lib/go-live";
import { companyEmailReadiness, companySmsReadiness } from "@/lib/go-live-providers";

export async function GET(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  const session = await getSession();
  const data = await getData({ leadLimit: 0 });
  const companies = data.brands.filter(b => canAccessEntity(session, b.id)).map(b => ({ id: b.id, name: b.name }));
  const entityId = new URL(request.url).searchParams.get("entityId") || companies[0]?.id;
  if (!entityId || !companies.some(b => b.id === entityId)) return NextResponse.json({ error: "Company not accessible" }, { status: 403 });
  const brand = data.brands.find(b => b.id === entityId)!;
  const [sms, email, setupItems, seo] = await Promise.all([
    companySmsReadiness(brand, data.brands), companyEmailReadiness(brand),
    isNeonConfigured() ? getPrisma().companySetupItem.findMany({ where: { entityId }, select: { key: true, status: true } }) : Promise.resolve([]),
    isNeonConfigured() ? getPrisma().seoProject.findUnique({ where: { entityId }, select: { automaticSync: true, syncError: true } }) : Promise.resolve(null),
  ]);
  const connections: ReadinessCheck[] = setupCatalog.filter(c => !["email", "sms"].includes(c.key)).map(c => {
    const status = (setupItems.find(i => i.key === c.key)?.status || "not_started") as SetupStatus;
    const detail = status === "tested" ? "Reviewed and marked tested by the owner. This checklist status is not a live provider health check." : status === "not_applicable" ? "Marked not needed for this company." : status === "not_started" ? "No completed setup review is saved for this company." : `${setupStatuses[status] || "Needs review"}. Saved links or passwords do not establish a live connection.`;
    return { id: c.key, title: c.title, state: setupReadiness(status), detail, href: `/company-setup?entity=${encodeURIComponent(entityId)}#${c.key}`, linkLabel: "Open company setup" };
  });
  const ahrefs = connections.find(c => c.id === "ahrefs");
  if (ahrefs && seo) { ahrefs.state = seo.syncError ? "needs_attention" : "pending"; ahrefs.detail = seo.syncError ? "The SEO reporting connection has an error. Review its report in Social Media." : seo.automaticSync ? "Automatic reporting is requested. Review the latest report and sync results in the SEO workspace." : "An SEO project is saved; reports are reviewed manually. Automatic reporting is not connected."; ahrefs.href = `/social?entity=${encodeURIComponent(entityId)}&platform=seo`; ahrefs.linkLabel = "Open SEO reports"; }
  const infrastructure: ReadinessCheck[] = [
    { id: "database", title: "Shared CRM database", state: isNeonConfigured() ? "active" : "inactive", detail: isNeonConfigured() ? "Live database connected. This does not activate any company's marketing accounts." : "Local storage is in use." },
    { id: "webhooks", title: "Shared webhook security", state: process.env.PUBLIC_APP_URL && process.env.TELNYX_PUBLIC_KEY && process.env.EMAIL_WEBHOOK_SECRET ? "active" : "pending", detail: "Checks the shared endpoint and verification configuration. Provider routing and successful deliveries must be confirmed separately for each company." },
  ];
  const result: CompanyGoLive = { companies, company: { id: brand.id, name: brand.name, domain: brand.domain, website: brand.websiteUrl }, messaging: [...email, ...sms], connections, infrastructure, checkedAt: new Date().toISOString() };
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
