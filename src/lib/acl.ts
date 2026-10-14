import { isAuthRequired, type SessionPayload } from "@/lib/auth";
import type { PlatformData } from "@/lib/types";

/**
 * Entity access control.
 * - No session + auth not required (local open mode): full admin access.
 * - No session + auth required: deny (middleware should already block).
 * - role=admin: all entities.
 * - role=member: only allowedEntityIds.
 * Shared lead pool stays shared; isolation is on portals/campaigns/inbox/reports.
 */

export function isAdminSession(session: SessionPayload | null): boolean {
  if (!session) return !isAuthRequired(); // anonymous open mode only when unlocked
  return session.role === "admin";
}

export function allowedEntityIdsFor(
  session: SessionPayload | null,
  allEntityIds: string[],
): string[] | "all" {
  if (!session) return isAuthRequired() ? [] : "all";
  if (session.role === "admin") return "all";
  const allowed = session.allowedEntityIds.filter((id) =>
    allEntityIds.includes(id),
  );
  return allowed;
}

export function canAccessEntity(
  session: SessionPayload | null,
  entityId: string,
): boolean {
  if (!session) return !isAuthRequired();
  if (session.role === "admin") return true;
  return session.allowedEntityIds.includes(entityId);
}

export function assertEntityAccess(
  session: SessionPayload | null,
  entityId: string,
): { ok: true } | { ok: false; status: 403; error: string } {
  if (canAccessEntity(session, entityId)) return { ok: true };
  return {
    ok: false,
    status: 403,
    error: "You do not have access to this entity",
  };
}

/** Filter platform payload so members never see other entities' portal data. */
export function scopePlatformData(
  data: PlatformData,
  session: SessionPayload | null,
): PlatformData & { currentUser?: SessionPayload | null } {
  const allowed = allowedEntityIdsFor(
    session,
    data.brands.map((b) => b.id),
  );
  if (allowed === "all") {
    return { ...data, currentUser: session };
  }

  const brandSet = new Set(allowed);
  const brands = data.brands.filter((b) => brandSet.has(b.id));
  const campaigns = data.campaigns.filter((c) => brandSet.has(c.brandId));
  const replies = data.replies.filter((r) => brandSet.has(r.brandId));
  const optOuts = data.optOuts.filter(
    (o) => !o.brandId || brandSet.has(o.brandId),
  );
  const costEntries = (data.costEntries || []).filter(
    (c) => !c.brandId || brandSet.has(c.brandId),
  );
  const messageTemplates = (data.messageTemplates || []).filter(
    (t) => !t.brandId || brandSet.has(t.brandId),
  );
  const adFolders = (data.adFolders || []).filter(
    (f) => !f.brandId || brandSet.has(f.brandId),
  );
  const adAssets = (data.adAssets || []).filter(
    (a) => !a.brandId || brandSet.has(a.brandId),
  );
  const socialCampaigns = (data.socialCampaigns || []).filter((c) =>
    brandSet.has(c.entityId),
  );
  const socialConnections = (data.socialConnections || []).filter((c) =>
    brandSet.has(c.entityId),
  );
  const rotation = {
    ...data.rotation,
    entityOrder: data.rotation.entityOrder.filter((id) => brandSet.has(id)),
    quotas: data.rotation.quotas.filter((q) => brandSet.has(q.entityId)),
  };

  // Leads stay shared (pool), but strip convertedEntityId outside scope from UI noise
  // — keep full pool so members can still run campaigns from shared leads.
  return {
    ...data,
    brands,
    campaigns,
    replies,
    optOuts,
    costEntries,
    messageTemplates,
    adFolders,
    adAssets,
    socialCampaigns,
    socialConnections,
    rotation,
    currentUser: session,
  };
}
