import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

/** Delegates required by Ads + auth — stale hot-reload clients often lack these. */
const REQUIRED_DELEGATES = [
  "appUser",
  "messageTemplate",
  "adFolder",
  "adAsset",
  "platformSettings",
  "entity",
  "inboxSend",
] as const;

function clientHasRequiredDelegates(client: PrismaClient): boolean {
  const c = client as unknown as Record<string, { findMany?: unknown } | undefined>;
  return REQUIRED_DELEGATES.every(
    (name) => typeof c[name]?.findMany === "function",
  );
}

export function isNeonConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return false;
  // Ignore the Prisma local stub URL from `prisma init`
  if (url.startsWith("prisma+postgres://")) return false;
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

export function getPrisma(): PrismaClient {
  if (!isNeonConfigured()) {
    throw new Error("DATABASE_URL is not set to a Neon Postgres connection string");
  }

  if (globalForPrisma.prisma) {
    if (clientHasRequiredDelegates(globalForPrisma.prisma)) {
      return globalForPrisma.prisma;
    }
    // Discard stale singleton from before prisma generate (missing AdFolder, etc.)
    void globalForPrisma.prisma.$disconnect().catch(() => undefined);
    globalForPrisma.prisma = undefined;
  }

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: true },
      max: 10,
    });
  globalForPrisma.pgPool = pool;

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  if (!clientHasRequiredDelegates(prisma)) {
    throw new Error(
      "Prisma client is missing Ads/auth model delegates. Run `npx prisma generate` and restart the server.",
    );
  }
  globalForPrisma.prisma = prisma;
  return prisma;
}
