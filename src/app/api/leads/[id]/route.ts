import { NextResponse } from "next/server";
import { canAccessEntity } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import { getData } from "@/lib/store";
import { normalizeContact } from "@/lib/eligibility";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await getSession();
  const data = await getData();
  const lead = data.leads.find((l) => l.id === id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const replies = data.replies.filter((r) => {
    if (r.leadId !== lead.id) return false;
    return canAccessEntity(session, r.brandId);
  });

  const campaignsTouched = data.campaigns.filter((c) => {
    if (!canAccessEntity(session, c.brandId)) return false;
    return data.sendEvents?.some(
      (e) => e.leadId === lead.id && e.campaignId === c.id,
    );
  });

  const sendEvents = (data.sendEvents || []).filter((e) => {
    if (e.leadId !== lead.id) return false;
    return canAccessEntity(session, e.entityId);
  });

  const contacts = [lead.email, lead.phone]
    .filter(Boolean)
    .map((c) => normalizeContact(c));
  const optOuts = data.optOuts.filter((o) =>
    contacts.includes(normalizeContact(o.contact)),
  );

  const entityTouches = lead.offeredEntityIds
    .filter((entityId) => canAccessEntity(session, entityId))
    .map((entityId) => {
      const brand = data.brands.find((b) => b.id === entityId);
      const entitySends = sendEvents.filter((e) => e.entityId === entityId);
      const last = entitySends[0]?.sentAt ?? null;
      return {
        entityId,
        name: brand?.name || entityId,
        shortName: brand?.shortName || entityId,
        sendCount: entitySends.length,
        lastSentAt: last,
      };
    });

  return NextResponse.json({
    lead,
    replies,
    sendEvents,
    campaigns: campaignsTouched,
    optOuts,
    entityTouches,
    brands: data.brands.filter((b) => canAccessEntity(session, b.id)),
  });
}
