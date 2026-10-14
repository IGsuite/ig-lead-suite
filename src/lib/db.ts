import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

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

  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
  globalForPrisma.pgPool = pool;

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  globalForPrisma.prisma = prisma;
  return prisma;
}
