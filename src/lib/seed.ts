import { defaultQuotas } from "@/lib/autopilot";
import type { PlatformData } from "@/lib/types";
import { buildSeedCollections } from "@/lib/seed-demo";

export const STORE_VERSION = 14;

export { materializeSeedAdAssets } from "@/lib/seed-assets";

export function createSeedData(): PlatformData {
  const now = new Date();
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  const brands: PlatformData["brands"] = [
    {
      id: "abstract",
      name: "Abstract Capital Group",
      shortName: "Abstract",
      focus: "Small business loans brokerage — MCA, LOC, term, SBA & more",
      programs: [
        "Revenue-based financing / MCA",
        "Lines of credit",
        "Term loans",
        "Equipment financing",
        "Invoice factoring",
        "SBA 7(a) / 504 / Bolt",
      ],
      domain: "abstractcapitalgroup.com",
      sendingSubdomain: "mail.abstractcapitalgroup.com",
      websiteUrl: "https://abstractcapitalgroup.com/",
      websiteApiUrl: "",
      crm: "hubspot",
      status: "warming",
      phoneNumbers: ["+15162661301"],
      tenDlcStatus: "approved",
      emailAuthStatus: "partial",
      weeklySendCap: 2000,
      rotationEnabled: true,
      socialLinks: {
        website: "https://abstractcapitalgroup.com/",
        facebook: "https://www.facebook.com/abstract",
        instagram: "https://www.instagram.com/abstract",
        linkedin: "https://www.linkedin.com/company/abstract",
        tiktok: "https://www.tiktok.com/@abstract",
      },
      notes:
        "Pilot entity. Telnyx 10DLC Brand OK (TCR BNHCFPV) — register 10DLC Campaign next for volume SMS.",
    },
    {
      id: "ahava",
      name: "Ahava Capital",
      shortName: "Ahava",
      focus: "Working capital & merchant cash advance — capital with love",
      programs: [
        "Working capital",
        "Merchant cash advance",
        "Business expansion funding",
      ],
      domain: "ahavacapital.com",
      sendingSubdomain: "mail.ahavacapital.com",
      websiteUrl: "https://www.ahavacapital.com/",
      websiteApiUrl: "",
      crm: "gohighlevel",
      status: "setup",
      phoneNumbers: [],
      tenDlcStatus: "not_started",
      emailAuthStatus: "missing",
      weeklySendCap: 0,
      rotationEnabled: true,
      socialLinks: {
        website: "https://www.ahavacapital.com/",
        facebook: "https://www.facebook.com/ahava",
        instagram: "https://www.instagram.com/ahava",
        linkedin: "https://www.linkedin.com/company/ahava",
        tiktok: "https://www.tiktok.com/@ahava",
      },
      notes: "Unsecured-style MCA / working capital lane.",
    },
    {
      id: "takemore",
      name: "Take More Funding",
      shortName: "Take More",
      focus: "Independent commercial finance brokerage — 50+ lenders shopped",
      programs: [
        "Working capital",
        "SBA loans",
        "Term loans",
        "Lines of credit",
        "Equipment financing",
        "Invoice factoring",
      ],
      domain: "takemorefunding.com",
      sendingSubdomain: "mail.takemorefunding.com",
      websiteUrl: "https://takemorefunding.com/",
      websiteApiUrl: "",
      crm: "custom",
      status: "setup",
      phoneNumbers: [],
      tenDlcStatus: "not_started",
      emailAuthStatus: "missing",
      weeklySendCap: 0,
      rotationEnabled: true,
      socialLinks: {
        website: "https://takemorefunding.com/",
        facebook: "https://www.facebook.com/takemore",
        instagram: "https://www.instagram.com/takemore",
        linkedin: "https://www.linkedin.com/company/takemore",
        tiktok: "https://www.tiktok.com/@takemore",
      },
      notes: "Brokerage positioning — one app, many lender offers.",
    },
    {
      id: "tyh",
      name: "TYH Marketing",
      shortName: "TYH",
      focus: "Paid ads, LLM SEO, social, media placements & websites",
      programs: [
        "Paid media",
        "LLM / AI search SEO",
        "Social media",
        "Media placements",
        "Websites",
        "Google review reputation",
      ],
      domain: "tyhmarketing.com",
      sendingSubdomain: "mail.tyhmarketing.com",
      websiteUrl: "https://www.tyhmarketing.com/",
      websiteApiUrl: "",
      crm: "pipedrive",
      status: "setup",
      phoneNumbers: [],
      tenDlcStatus: "not_started",
      emailAuthStatus: "missing",
      weeklySendCap: 0,
      rotationEnabled: true,
      socialLinks: {
        website: "https://www.tyhmarketing.com/",
        facebook: "https://www.facebook.com/tyh",
        instagram: "https://www.instagram.com/tyh",
        linkedin: "https://www.linkedin.com/company/tyh",
        tiktok: "https://www.tiktok.com/@tyh",
      },
      notes: "Non-lending offer — strong alternate for leads that don’t fund.",
    },
    {
      id: "venture",
      name: "Venture Business Capital",
      shortName: "Venture",
      focus: "Institutional business & real estate financing — no equity dilution",
      programs: [
        "Term loans",
        "Lines of credit",
        "Acquisition financing",
        "Commercial / hard money / construction / bridge",
      ],
      domain: "venturebusinesscapital.com",
      sendingSubdomain: "mail.venturebusinesscapital.com",
      websiteUrl: "https://www.venturebusinesscapital.com/",
      websiteApiUrl: "",
      crm: "salesforce",
      status: "setup",
      phoneNumbers: [],
      tenDlcStatus: "not_started",
      emailAuthStatus: "missing",
      weeklySendCap: 0,
      rotationEnabled: true,
      socialLinks: {
        website: "https://www.venturebusinesscapital.com/",
        facebook: "https://www.facebook.com/venture",
        instagram: "https://www.instagram.com/venture",
        linkedin: "https://www.linkedin.com/company/venture",
        tiktok: "https://www.tiktok.com/@venture",
      },
      notes: "Traditional / institutional financing + real estate capital.",
    },
  ];

  const sources = [
    { source: "LeadForge", cost: 85 },
    { source: "QueueData", cost: 72 },
    { source: "NorthList", cost: 95 },
  ];

  const firstNames = [
    "Maya",
    "Jordan",
    "Priya",
    "Chris",
    "Elena",
    "Sam",
    "Nina",
    "Omar",
    "Riley",
    "Ava",
  ];
  const lastNames = [
    "Chen",
    "Brooks",
    "Patel",
    "Nguyen",
    "Garcia",
    "Kim",
    "Walsh",
    "Hassan",
    "Stone",
    "Diaz",
  ];

  const entityIds = brands.map((b) => b.id);

  const leads: PlatformData["leads"] = [];
  for (let i = 0; i < 48; i++) {
    const src = sources[i % sources.length];
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i * 3) % lastNames.length];
    const optedOut = i % 17 === 0;
    const offeredCount = optedOut ? 0 : i % 5;
    const offeredEntityIds = entityIds.slice(0, offeredCount);
    const lastEntityId =
      offeredEntityIds.length > 0
        ? offeredEntityIds[offeredEntityIds.length - 1]
        : null;

    const groups = ["Week 12 file", "March MCA pack", "General"];
    const groupName = groups[i % groups.length];
    const email =
      i % 13 === 0
        ? `${fn.toLowerCase()}@mailinator.com`
        : `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@gmail.com`;
    const phone =
      i % 19 === 0 ? "+10000000000" : `+1555${String(2000000 + i).padStart(7, "0")}`;
    const emailStatus =
      i % 13 === 0 ? "invalid" : i % 7 === 0 ? "unverified" : "valid";
    const phoneStatus =
      i % 19 === 0 ? "invalid" : i % 7 === 0 ? "unverified" : "valid";

    leads.push({
      id: `lead-${i + 1}`,
      email,
      phone,
      firstName: fn,
      lastName: ln,
      source: src.source,
      groupName,
      purchaseDate: daysAgo(10 + (i % 12)).slice(0, 10),
      costCents: src.cost,
      offeredEntityIds,
      lastEntityId,
      convertedEntityId: null,
      status: optedOut
        ? "opted_out"
        : i % 11 === 0
          ? "replied"
          : offeredCount > 0
            ? "contacted"
            : "available",
      optedOut,
      emailStatus,
      phoneStatus,
      verifyNotes:
        emailStatus === "unverified"
          ? undefined
          : `seed: email ${emailStatus}, phone ${phoneStatus}`,
      verifiedAt:
        emailStatus === "unverified" ? undefined : daysAgo(7 + (i % 3)),
      uploadBatchId: "upload-seed",
      createdAt: daysAgo(8 + (i % 6)),
    });
  }

  const {
    campaigns,
    replies,
    optOuts,
    adFolders,
    messageTemplates,
    adAssets,
    socialCampaigns,
    socialConnections,
  } = buildSeedCollections(brands, leads, daysAgo);

  return {
    version: STORE_VERSION,
    brands,
    leads,
    uploads: [
      {
        id: "upload-seed",
        filename: "leadforge-week12.csv",
        source: "LeadForge",
        groupName: "Week 12 file",
        purchaseDate: daysAgo(10).slice(0, 10),
        costCents: 187000,
        rowCount: 48,
        duplicateCount: 3,
        importedCount: 45,
        createdAt: daysAgo(8),
      },
    ],
    campaigns,
    replies,
    optOuts,
    messageTemplates,
    adFolders,
    adAssets,
    socialCampaigns,
    socialConnections,
    providerSpend: [
      {
        source: "LeadForge",
        leadsPurchased: 2200,
        costCents: 187000,
        replies: 64,
        conversions: 11,
      },
      {
        source: "QueueData",
        leadsPurchased: 1800,
        costCents: 129600,
        replies: 41,
        conversions: 6,
      },
      {
        source: "NorthList",
        leadsPurchased: 900,
        costCents: 85500,
        replies: 19,
        conversions: 2,
      },
    ],
    costEntries: [
      {
        id: "cost-shared-neon",
        brandId: null,
        category: "integration",
        label: "Neon Postgres (monthly)",
        vendor: "Neon",
        amountCents: 1900,
        incurredAt: daysAgo(2).slice(0, 10),
        notes: "Shared backend for all entities",
        createdAt: daysAgo(2),
      },
      {
        id: "cost-shared-telnyx",
        brandId: null,
        category: "integration",
        label: "Telnyx account / numbers retainer",
        vendor: "Telnyx",
        amountCents: 5000,
        incurredAt: daysAgo(5).slice(0, 10),
        createdAt: daysAgo(5),
      },
      {
        id: "cost-shared-instantly",
        brandId: null,
        category: "integration",
        label: "Instantly / cold email seats",
        vendor: "Instantly",
        amountCents: 9700,
        incurredAt: daysAgo(5).slice(0, 10),
        createdAt: daysAgo(5),
      },
      {
        id: "cost-abstract-sms",
        brandId: "abstract",
        category: "sms",
        label: "Abstract SMS sends (Telnyx)",
        vendor: "Telnyx",
        amountCents: 12400,
        incurredAt: daysAgo(3).slice(0, 10),
        createdAt: daysAgo(3),
      },
      {
        id: "cost-abstract-email",
        brandId: "abstract",
        category: "email",
        label: "Abstract cold email sends",
        vendor: "Instantly",
        amountCents: 8800,
        incurredAt: daysAgo(3).slice(0, 10),
        createdAt: daysAgo(3),
      },
      {
        id: "cost-abstract-10dlc",
        brandId: "abstract",
        category: "setup",
        label: "10DLC brand + campaign registration",
        vendor: "Telnyx",
        amountCents: 15000,
        incurredAt: daysAgo(20).slice(0, 10),
        notes: "One-time setup",
        createdAt: daysAgo(20),
      },
      {
        id: "cost-ahava-sms",
        brandId: "ahava",
        category: "sms",
        label: "Ahava SMS sends",
        vendor: "Telnyx",
        amountCents: 9100,
        incurredAt: daysAgo(2).slice(0, 10),
        createdAt: daysAgo(2),
      },
      {
        id: "cost-ahava-email",
        brandId: "ahava",
        category: "email",
        label: "Ahava cold email sends",
        vendor: "Instantly",
        amountCents: 6400,
        incurredAt: daysAgo(2).slice(0, 10),
        createdAt: daysAgo(2),
      },
      {
        id: "cost-takemore-sms",
        brandId: "takemore",
        category: "sms",
        label: "Take More SMS sends",
        vendor: "Telnyx",
        amountCents: 7600,
        incurredAt: daysAgo(4).slice(0, 10),
        createdAt: daysAgo(4),
      },
      {
        id: "cost-venture-setup",
        brandId: "venture",
        category: "setup",
        label: "Sending subdomain + DNS",
        vendor: "Cloudflare",
        amountCents: 0,
        incurredAt: daysAgo(15).slice(0, 10),
        notes: "DNS only — $0 cash, tracked for ops",
        createdAt: daysAgo(15),
      },
      {
        id: "cost-tyh-email",
        brandId: "tyh",
        category: "email",
        label: "TYH marketing email sends",
        vendor: "Instantly",
        amountCents: 5200,
        incurredAt: daysAgo(1).slice(0, 10),
        createdAt: daysAgo(1),
      },
      {
        id: "cost-leads-shared",
        brandId: null,
        category: "leads",
        label: "LeadForge week 12 file (shared pool)",
        vendor: "LeadForge",
        amountCents: 187000,
        incurredAt: daysAgo(10).slice(0, 10),
        notes: "Allocated across entities via shared pool",
        createdAt: daysAgo(10),
      },
    ],
    sendEvents: [],
    rotation: {
      mode: "round_robin",
      entityOrder: ["abstract", "ahava", "takemore", "venture", "tyh"],
      notes:
        "Ferris-wheel autopilot: shared pool rotates through each entity daily. Each portal keeps its own email/SMS campaigns — nothing mixes.",
      autopilotEnabled: true,
      poolCursor: 0,
      quotas: defaultQuotas([
        "abstract",
        "ahava",
        "takemore",
        "venture",
        "tyh",
      ]),
      nextRunAt: new Date(
        Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate() + 1,
          14,
          0,
          0,
        ),
      ).toISOString(),
    },
  };
}
