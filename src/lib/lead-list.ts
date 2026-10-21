import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { mapLead } from "@/lib/mappers";
import type { Lead as DbLead } from "@/generated/prisma/client";

export type LeadListInput = { query?: string; group?: string; source?: string; folder?: string; cursor?: string };
const presentEmail = Prisma.sql`NULLIF(btrim("email"),'') IS NOT NULL`;
const presentPhone = Prisma.sql`NULLIF(btrim("phone"),'') IS NOT NULL`;
const ready = Prisma.sql`((${presentEmail} AND "emailStatus"='valid') OR (${presentPhone} AND "phoneStatus"='valid'))`;
const review = Prisma.sql`((${presentEmail} AND "emailStatus" IN ('unverified','risky')) OR (${presentPhone} AND "phoneStatus" IN ('unverified','risky')))`;

export async function listLeads(input: LeadListInput) {
  const db = getPrisma();
  const clauses: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (input.query?.trim()) {
    const q = `%${input.query.trim().slice(0,200).replace(/[\\%_]/g, "\\$&")}%`;
    clauses.push(Prisma.sql`concat_ws(' ',"firstName","lastName","businessName","email","phone","source","groupName") ILIKE ${q}`);
  }
  if (input.group && input.group !== "all") clauses.push(Prisma.sql`"groupName"=${input.group}`);
  if (input.source?.startsWith("manual-package:")) clauses.push(Prisma.sql`"manualPackages" @> ${JSON.stringify([{id:input.source.slice(15)}])}::jsonb`);
  else if (input.source && input.source !== "all") clauses.push(Prisma.sql`"source"=${input.source}`);
  if (input.folder === "valid") clauses.push(Prisma.sql`NOT "optedOut" AND ${ready}`);
  if (["unverified","risky"].includes(input.folder || "")) clauses.push(Prisma.sql`NOT "optedOut" AND NOT ${ready} AND ${review}`);
  if (input.folder === "invalid") clauses.push(Prisma.sql`NOT "optedOut" AND NOT ${ready} AND NOT ${review}`);
  if (input.folder === "suppressed") clauses.push(Prisma.sql`"optedOut"`);
  const filter = Prisma.join(clauses, " AND ");
  let after = Prisma.sql``;
  if (input.cursor) {
    const parsed = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2 || !Number.isFinite(Date.parse(parsed[0])) || typeof parsed[1] !== "string") throw new Error("Invalid lead cursor");
    after = Prisma.sql`AND ("createdAt","id") < (${new Date(parsed[0])},${parsed[1]})`;
  }
  const [rows, count, stats, groups, packages] = await Promise.all([
    db.$queryRaw<DbLead[]>(Prisma.sql`SELECT * FROM "Lead" WHERE ${filter} ${after} ORDER BY "createdAt" DESC,"id" DESC LIMIT 101`),
    db.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT count(*) FROM "Lead" WHERE ${filter}`),
    db.$queryRaw<{total:bigint;valid:bigint;unverified:bigint;invalid:bigint;suppressed:bigint}[]>(Prisma.sql`
      SELECT count(*) AS total,
      count(*) FILTER(WHERE NOT "optedOut" AND ${ready}) AS valid,
      count(*) FILTER(WHERE NOT "optedOut" AND NOT ${ready} AND ${review}) AS unverified,
      count(*) FILTER(WHERE NOT "optedOut" AND NOT ${ready} AND NOT ${review}) AS invalid,
      count(*) FILTER(WHERE "optedOut") AS suppressed FROM "Lead"`),
    db.$queryRaw<{groupName:string}[]>`SELECT DISTINCT "groupName" FROM "Lead" ORDER BY "groupName" LIMIT 2000`,
    db.$queryRaw<{id:string;name:string;count:bigint}[]>`SELECT p->>'id' AS id,p->>'name' AS name,count(*) FROM "Lead", jsonb_array_elements("manualPackages") AS p GROUP BY p->>'id',p->>'name' ORDER BY name LIMIT 1000`,
  ]);
  const page = rows.slice(0,100), last = page.at(-1);
  return { leads: page.map(mapLead), total: Number(stats[0].total), filteredCount: Number(count[0].count),
    stats: Object.fromEntries(Object.entries(stats[0]).map(([k,v]) => [k,Number(v)])),
    groups: groups.map(g=>g.groupName), packages: packages.map(p=>({...p,count:Number(p.count)})),
    nextCursor: rows.length > 100 && last ? Buffer.from(JSON.stringify([last.createdAt.toISOString(),last.id])).toString("base64url") : null };
}
