import { NextResponse } from "next/server";

/**
 * Live Telnyx 10DLC brand/campaign status (no secrets echoed).
 */
export async function GET() {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      configured: false,
      brands: [],
      summary: "Telnyx API key not set",
    });
  }

  try {
    const res = await fetch("https://api.telnyx.com/v2/10dlc/brand", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const json = (await res.json()) as {
      data?: Array<Record<string, unknown>>;
      records?: Array<Record<string, unknown>>;
      errors?: unknown;
    };
    if (!res.ok) {
      return NextResponse.json(
        {
          configured: true,
          error: "Telnyx 10DLC brand list failed",
          brands: [],
        },
        { status: 502 },
      );
    }
    const brands = (json.records || json.data || []).map((b) => ({
      brandId: String(b.brandId || b.id || ""),
      displayName: String(b.displayName || b.companyName || ""),
      status: String(b.status || ""),
      identityStatus: b.identityStatus ? String(b.identityStatus) : null,
      tcrBrandId: b.tcrBrandId ? String(b.tcrBrandId) : null,
      assignedCampaignsCount: Number(b.assignedCampaignsCount || 0),
      createdAt: b.createdAt ? String(b.createdAt) : null,
    }));

    const withCampaigns = await Promise.all(
      brands.map(async (brand) => {
        if (!brand.brandId) return { ...brand, campaigns: [] as string[] };
        const cRes = await fetch(
          `https://api.telnyx.com/v2/10dlc/campaign?brandId=${encodeURIComponent(brand.brandId)}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: "no-store",
          },
        );
        const cJson = (await cRes.json().catch(() => ({}))) as {
          records?: Array<{ campaignId?: string; status?: string }>;
          data?: Array<{ campaignId?: string; status?: string }>;
        };
        const records = cJson.records || cJson.data || [];
        return {
          ...brand,
          campaigns: records.map(
            (r) => `${r.campaignId || "?"} (${r.status || "unknown"})`,
          ),
        };
      }),
    );

    const brandOk = withCampaigns.some((b) => b.status === "OK");
    const hasCampaign = withCampaigns.some((b) => b.campaigns.length > 0);
    let summary = "No 10DLC brands registered";
    if (brandOk && !hasCampaign) {
      summary =
        "10DLC Brand approved (status OK) — register a 10DLC Campaign next for volume SMS";
    } else if (brandOk && hasCampaign) {
      summary = "10DLC Brand + Campaign present";
    } else if (withCampaigns.length) {
      summary = `Brand status: ${withCampaigns.map((b) => b.status).join(", ")}`;
    }

    return NextResponse.json({
      configured: true,
      brands: withCampaigns,
      summary,
      pending: brandOk && !hasCampaign ? "10dlc_campaign" : !brandOk ? "10dlc_brand" : null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        error: err instanceof Error ? err.message : "Telnyx request failed",
        brands: [],
      },
      { status: 502 },
    );
  }
}
