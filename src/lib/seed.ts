import type { PlatformData } from "@/lib/types";

export function createSeedData(): PlatformData {
  const now = new Date();
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  const brands: PlatformData["brands"] = [
    {
      id: "brand-1",
      name: "Brand 1",
      domain: "brand1.com",
      sendingSubdomain: "mail.brand1.com",
      crm: "hubspot",
      status: "warming",
      phoneNumbers: ["+1 (555) 010-1001", "+1 (555) 010-1002", "+1 (555) 010-1003"],
      tenDlcStatus: "pending",
      emailAuthStatus: "partial",
      weeklySendCap: 2000,
      notes: "Primary pilot brand. Warm-up in progress.",
    },
    {
      id: "brand-2",
      name: "Brand 2",
      domain: "brand2.com",
      sendingSubdomain: "mail.brand2.com",
      crm: "gohighlevel",
      status: "setup",
      phoneNumbers: [],
      tenDlcStatus: "not_started",
      emailAuthStatus: "missing",
      weeklySendCap: 0,
    },
    {
      id: "brand-3",
      name: "Brand 3",
      domain: "brand3.com",
      sendingSubdomain: "mail.brand3.com",
      crm: "salesforce",
      status: "setup",
      phoneNumbers: [],
      tenDlcStatus: "not_started",
      emailAuthStatus: "missing",
      weeklySendCap: 0,
    },
    {
      id: "brand-4",
      name: "Brand 4",
      domain: "brand4.com",
      sendingSubdomain: "mail.brand4.com",
      crm: "pipedrive",
      status: "setup",
      phoneNumbers: [],
      tenDlcStatus: "not_started",
      emailAuthStatus: "missing",
      weeklySendCap: 0,
    },
    {
      id: "brand-5",
      name: "Brand 5",
      domain: "brand5.com",
      sendingSubdomain: "mail.brand5.com",
      crm: "custom",
      status: "setup",
      phoneNumbers: [],
      tenDlcStatus: "not_started",
      emailAuthStatus: "missing",
      weeklySendCap: 0,
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

  const leads: PlatformData["leads"] = [];
  for (let i = 0; i < 48; i++) {
    const src = sources[i % sources.length];
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i * 3) % lastNames.length];
    const optedOut = i % 17 === 0;
    leads.push({
      id: `lead-${i + 1}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`,
      phone: `+1555${String(1000000 + i).slice(0, 7)}`,
      firstName: fn,
      lastName: ln,
      source: src.source,
      purchaseDate: daysAgo(10 + (i % 12)).slice(0, 10),
      costCents: src.cost,
      brandId: i % 5 === 0 ? "brand-1" : null,
      status: optedOut
        ? "opted_out"
        : i % 9 === 0
          ? "replied"
          : i % 4 === 0
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
      brandId: "brand-1",
      name: "Brand 1 — March warm-up SMS",
      channel: "sms",
      message:
        "Hi {{firstName}}, this is {{brand}} — quick question about your recent inquiry. Reply YES if you'd like details, or STOP to opt out.",
      sourceFilter: "all",
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
      brandId: "brand-1",
      name: "Brand 1 — Email intro A",
      channel: "email",
      subject: "A quick note from {{brand}}",
      message:
        "Hi {{firstName}},\n\nWe help homeowners like you compare options without the pressure. Reply to this email if you want a short overview.\n\nUnsubscribe anytime.",
      sourceFilter: "LeadForge",
      volume: 1000,
      throttlePerHour: 200,
      status: "draft",
      sentCount: 0,
      replyCount: 0,
      optOutCount: 0,
      bounceCount: 0,
      createdAt: daysAgo(1),
    },
  ];

  const replies: PlatformData["replies"] = [
    {
      id: "reply-1",
      campaignId: "camp-1",
      brandId: "brand-1",
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
      brandId: "brand-1",
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
      brandId: "brand-1",
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
      brandId: "brand-1",
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

  const providerSpend: PlatformData["providerSpend"] = [
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
  ];

  return {
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
    providerSpend,
  };
}
