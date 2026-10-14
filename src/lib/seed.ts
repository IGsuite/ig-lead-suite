import { defaultQuotas } from "@/lib/autopilot";
import type { PlatformData } from "@/lib/types";

export const STORE_VERSION = 6;

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
      phoneNumbers: ["+1 (555) 010-1001", "+1 (555) 010-1002", "+1 (555) 010-1003"],
      tenDlcStatus: "pending",
      emailAuthStatus: "partial",
      weeklySendCap: 2000,
      rotationEnabled: true,
      notes: "Pilot entity for warm-up. Broad brokerage menu.",
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

  const campaigns: PlatformData["campaigns"] = [
    {
      id: "camp-1",
      brandId: "abstract",
      name: "Abstract — MCA warm-up SMS",
      channel: "sms",
      message:
        "Hi {{firstName}}, Abstract Capital Group here — working capital may be available for your business. Reply YES for options, or STOP to opt out.",
      sourceFilter: "all",
      groupFilter: "all",
      preferUnoffered: true,
      preferVerified: true,
      volume: 500,
      throttlePerHour: 80,
      status: "sending",
      sentCount: 312,
      replyCount: 18,
      optOutCount: 4,
      bounceCount: 2,
      createdAt: daysAgo(5),
      startedAt: daysAgo(4),
    },
    {
      id: "camp-2",
      brandId: "ahava",
      name: "Ahava — working capital intro",
      channel: "sms",
      message:
        "Hi {{firstName}}, Ahava Capital — quick note on merchant cash advance / working capital. Reply YES if you want details, STOP to opt out.",
      sourceFilter: "all",
      groupFilter: "all",
      preferUnoffered: true,
      preferVerified: true,
      volume: 800,
      throttlePerHour: 100,
      status: "draft",
      sentCount: 0,
      replyCount: 0,
      optOutCount: 0,
      bounceCount: 0,
      createdAt: daysAgo(1),
    },
    {
      id: "camp-3",
      brandId: "takemore",
      name: "Take More — brokerage shop SMS",
      channel: "sms",
      message:
        "Hi {{firstName}}, Take More Funding shops 50+ lenders for your business. Reply YES for a free match, STOP to opt out.",
      sourceFilter: "all",
      groupFilter: "all",
      preferUnoffered: true,
      preferVerified: true,
      volume: 700,
      throttlePerHour: 90,
      status: "draft",
      sentCount: 0,
      replyCount: 0,
      optOutCount: 0,
      bounceCount: 0,
      createdAt: daysAgo(1),
    },
    {
      id: "camp-4",
      brandId: "tyh",
      name: "TYH — marketing growth email",
      channel: "email",
      subject: "{{firstName}}, get your business recommended by AI search",
      message:
        "Hi {{firstName}},\n\nTYH Marketing helps business owners win customers through paid ads, AI search SEO, and national media placements. Reply if you want a short growth overview.\n\nUnsubscribe anytime.",
      sourceFilter: "LeadForge",
      groupFilter: "all",
      preferUnoffered: true,
      preferVerified: true,
      volume: 1000,
      throttlePerHour: 200,
      status: "draft",
      sentCount: 0,
      replyCount: 0,
      optOutCount: 0,
      bounceCount: 0,
      createdAt: daysAgo(1),
    },
    {
      id: "camp-5",
      brandId: "venture",
      name: "Venture — institutional financing SMS",
      channel: "sms",
      message:
        "Hi {{firstName}}, Venture Business Capital — institutional business & real estate financing without giving up equity. Reply YES for info, STOP to opt out.",
      sourceFilter: "all",
      groupFilter: "all",
      preferUnoffered: true,
      preferVerified: true,
      volume: 600,
      throttlePerHour: 90,
      status: "draft",
      sentCount: 0,
      replyCount: 0,
      optOutCount: 0,
      bounceCount: 0,
      createdAt: daysAgo(0),
    },
  ];

  // Diversify replies across sources so entity portals show Scale up / Cut.
  // lead-4 LeadForge, lead-5 QueueData, lead-9 NorthList, lead-11 NorthList, lead-16 QueueData
  const replies: PlatformData["replies"] = [
    {
      id: "reply-1",
      campaignId: "camp-1",
      brandId: "abstract",
      leadId: "lead-4",
      channel: "sms",
      from: "+15552000003",
      body: "YES interested, call me after 5",
      sentiment: "interested",
      crmSynced: true,
      createdAt: daysAgo(1),
      read: false,
    },
    {
      id: "reply-2",
      campaignId: "camp-1",
      brandId: "abstract",
      leadId: "lead-5",
      channel: "sms",
      from: "+15552000004",
      body: "Who is this?",
      sentiment: "neutral",
      crmSynced: false,
      createdAt: daysAgo(1),
      read: false,
    },
    {
      id: "reply-3",
      campaignId: "camp-1",
      brandId: "abstract",
      leadId: "lead-9",
      channel: "sms",
      from: "+15552000008",
      body: "STOP",
      sentiment: "opt_out",
      crmSynced: false,
      createdAt: daysAgo(2),
      read: true,
    },
    {
      id: "reply-4",
      campaignId: "camp-1",
      brandId: "abstract",
      leadId: "lead-11",
      channel: "sms",
      from: "+15552000010",
      body: "Not interested thanks",
      sentiment: "not_interested",
      crmSynced: false,
      createdAt: daysAgo(0),
      read: false,
    },
    {
      id: "reply-5",
      campaignId: "camp-1",
      brandId: "abstract",
      leadId: "lead-16",
      channel: "sms",
      from: "+15552000015",
      body: "Send me rates",
      sentiment: "interested",
      crmSynced: false,
      createdAt: daysAgo(0),
      read: false,
    },
    {
      id: "reply-6",
      campaignId: "camp-2",
      brandId: "ahava",
      leadId: "lead-8",
      channel: "sms",
      from: "+15552000007",
      body: "YES tell me more",
      sentiment: "interested",
      crmSynced: false,
      createdAt: daysAgo(0),
      read: false,
    },
    {
      id: "reply-7",
      campaignId: "camp-2",
      brandId: "ahava",
      leadId: "lead-10",
      channel: "sms",
      from: "+15552000009",
      body: "Already funded",
      sentiment: "not_interested",
      crmSynced: false,
      createdAt: daysAgo(1),
      read: true,
    },
    {
      id: "reply-8",
      campaignId: "camp-2",
      brandId: "ahava",
      leadId: "lead-15",
      channel: "sms",
      from: "+15552000014",
      body: "Maybe later",
      sentiment: "neutral",
      crmSynced: false,
      createdAt: daysAgo(0),
      read: false,
    },
  ];

  const optOuts: PlatformData["optOuts"] = leads
    .filter((l) => l.optedOut)
    .map((l, idx) => ({
      id: `opt-${idx + 1}`,
      contact: l.phone || l.email || "unknown",
      channel: "both" as const,
      reason: "STOP / unsubscribe",
      brandId: null,
      createdAt: l.createdAt,
    }));

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
    rotation: {
      mode: "round_robin",
      entityOrder: ["abstract", "ahava", "takemore", "venture", "tyh"],
      notes:
        "Ferris-wheel autopilot: shared pool rotates through each entity daily. Each portal keeps its own email/SMS campaigns — nothing mixes.",
      autopilotEnabled: true,
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
