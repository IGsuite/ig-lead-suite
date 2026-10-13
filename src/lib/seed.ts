import type { PlatformData } from "@/lib/types";

export const STORE_VERSION = 2;

export function createSeedData(): PlatformData {
  const now = new Date();
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  const brands: PlatformData["brands"] = [
    {
      id: "abstract",
      name: "Abstract Capital Group",
      shortName: "Abstract",
      focus: "Brokerage — multiple financing programs",
      programs: [
        "Merchant cash advance",
        "Unsecured financing",
        "Secured financing",
      ],
      domain: "abstractcapitalgroup.com",
      sendingSubdomain: "mail.abstractcapitalgroup.com",
      websiteUrl: "https://abstractcapitalgroup.com",
      websiteApiUrl: "",
      crm: "hubspot",
      status: "warming",
      phoneNumbers: ["+1 (555) 010-1001", "+1 (555) 010-1002", "+1 (555) 010-1003"],
      tenDlcStatus: "pending",
      emailAuthStatus: "partial",
      weeklySendCap: 2000,
      rotationEnabled: true,
      notes: "Pilot entity for warm-up. Full brokerage menu.",
    },
    {
      id: "venture",
      name: "Venture Business Capital",
      shortName: "Venture",
      focus: "Traditional financing only",
      programs: ["Traditional term financing"],
      domain: "venturebusinesscapital.com",
      sendingSubdomain: "mail.venturebusinesscapital.com",
      websiteUrl: "https://venturebusinesscapital.com",
      websiteApiUrl: "",
      crm: "gohighlevel",
      status: "setup",
      phoneNumbers: [],
      tenDlcStatus: "not_started",
      emailAuthStatus: "missing",
      weeklySendCap: 0,
      rotationEnabled: true,
      notes: "Strictly traditional financing offers.",
    },
    {
      id: "toah",
      name: "TOAH Marketing",
      shortName: "TOAH",
      focus: "SEO & marketing for business owners",
      programs: ["SEO", "Digital marketing retainers"],
      domain: "toahmarketing.com",
      sendingSubdomain: "mail.toahmarketing.com",
      websiteUrl: "https://toahmarketing.com",
      websiteApiUrl: "",
      crm: "pipedrive",
      status: "setup",
      phoneNumbers: [],
      tenDlcStatus: "not_started",
      emailAuthStatus: "missing",
      weeklySendCap: 0,
      rotationEnabled: true,
      notes: "Non-lending offer — good alternate for leads that don’t fund.",
    },
    {
      id: "havoc",
      name: "Havoc Capital Group",
      shortName: "Havoc",
      focus: "Unsecured lending only",
      programs: ["Unsecured business lending"],
      domain: "havoccapitalgroup.com",
      sendingSubdomain: "mail.havoccapitalgroup.com",
      websiteUrl: "https://havoccapitalgroup.com",
      websiteApiUrl: "",
      crm: "custom",
      status: "setup",
      phoneNumbers: [],
      tenDlcStatus: "not_started",
      emailAuthStatus: "missing",
      weeklySendCap: 0,
      rotationEnabled: true,
      notes: "Unsecured-only offer lane.",
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
    const offeredCount = optedOut ? 0 : i % 4;
    const offeredEntityIds = entityIds.slice(0, offeredCount);
    const lastEntityId =
      offeredEntityIds.length > 0
        ? offeredEntityIds[offeredEntityIds.length - 1]
        : null;

    leads.push({
      id: `lead-${i + 1}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`,
      phone: `+1555${String(1000000 + i).slice(0, 7)}`,
      firstName: fn,
      lastName: ln,
      source: src.source,
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
      preferUnoffered: true,
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
      brandId: "havoc",
      name: "Havoc — unsecured lending intro",
      channel: "sms",
      message:
        "Hi {{firstName}}, Havoc Capital Group — quick note on unsecured business funding. Reply YES if you want details, STOP to opt out.",
      sourceFilter: "all",
      preferUnoffered: true,
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
      brandId: "toah",
      name: "TOAH — SEO for owners email",
      channel: "email",
      subject: "{{firstName}}, grow local search without guessing",
      message:
        "Hi {{firstName}},\n\nTOAH Marketing helps business owners win more customers through SEO. Reply if you want a short audit overview.\n\nUnsubscribe anytime.",
      sourceFilter: "LeadForge",
      preferUnoffered: true,
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
      id: "camp-4",
      brandId: "venture",
      name: "Venture — traditional financing SMS",
      channel: "sms",
      message:
        "Hi {{firstName}}, Venture Business Capital — traditional financing options for qualified businesses. Reply YES for info, STOP to opt out.",
      sourceFilter: "all",
      preferUnoffered: true,
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

  const replies: PlatformData["replies"] = [
    {
      id: "reply-1",
      campaignId: "camp-1",
      brandId: "abstract",
      leadId: "lead-9",
      channel: "sms",
      from: "+15551000008",
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
      leadId: "lead-18",
      channel: "sms",
      from: "+15551000017",
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
      leadId: "lead-27",
      channel: "sms",
      from: "+15551000026",
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
      leadId: "lead-36",
      channel: "sms",
      from: "+15551000035",
      body: "Not interested thanks",
      sentiment: "not_interested",
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
      entityOrder: ["abstract", "havoc", "venture", "toah"],
      notes:
        "One shared lead pool. Blasts rotate entity offers so a contact can hear from Abstract, Havoc, Venture, or TOAH — and convert with whichever fit.",
    },
  };
}
