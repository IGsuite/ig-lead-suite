import { promises as fs } from "fs";
import path from "path";
import { hashPassword, toPublicUser, verifyPassword } from "@/lib/auth";
import { isNeonConfigured, getPrisma } from "@/lib/db";
import type { AppUser, AppUserPublic, UserRole } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const DEFAULT_ADMIN_EMAIL =
  process.env.AUTH_ADMIN_EMAIL?.trim().toLowerCase() || "admin@signaldesk.local";
const DEFAULT_ADMIN_PASSWORD =
  process.env.AUTH_ADMIN_PASSWORD?.trim() || "changeme";

function isMissingUserTable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    /relation ["']?AppUser["']? does not exist/i.test(msg) ||
    /relation ["']?app_user["']? does not exist/i.test(msg) ||
    /table [`"']?AppUser[`"']? does not exist/i.test(msg) ||
    /\bP2021\b/.test(msg) ||
    // Stale Prisma singleton after schema bump (appUser delegate missing)
    /Cannot read properties of undefined \(reading '(findMany|findUnique|create|update|delete)'\)/i.test(
      msg,
    ) ||
    /missing Ads\/auth model delegates/i.test(msg)
  );
}

async function readJsonUsers(): Promise<AppUser[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    return JSON.parse(raw) as AppUser[];
  } catch {
    return [];
  }
}

async function writeJsonUsers(users: AppUser[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

function mapDbUser(row: {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  allowedEntityIds: string[];
  createdAt: Date;
}): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    role: row.role as UserRole,
    allowedEntityIds: row.allowedEntityIds,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function ensureDefaultAdmin(): Promise<void> {
  const byEmail = await getUserByEmail(DEFAULT_ADMIN_EMAIL);
  if (byEmail) return;
  const existing = await listUsers();
  if (existing.length > 0) return;
  try {
    await createUser({
      email: DEFAULT_ADMIN_EMAIL,
      name: "Master Marketing CRM Admin",
      password: DEFAULT_ADMIN_PASSWORD,
      role: "admin",
      allowedEntityIds: [],
    });
  } catch (err) {
    // Concurrent bootstrap or unique race — safe to ignore if admin exists
    if (await getUserByEmail(DEFAULT_ADMIN_EMAIL)) return;
    throw err;
  }
}

export async function listUsers(): Promise<AppUserPublic[]> {
  if (isNeonConfigured()) {
    try {
      const prisma = getPrisma();
      const rows = await prisma.appUser.findMany({ orderBy: { createdAt: "asc" } });
      return rows.map((r) => toPublicUser(mapDbUser(r)));
    } catch (err) {
      if (!isMissingUserTable(err)) throw err;
      return (await readJsonUsers()).map(toPublicUser);
    }
  }
  return (await readJsonUsers()).map(toPublicUser);
}

export async function getUserById(id: string): Promise<AppUser | null> {
  if (isNeonConfigured()) {
    try {
      const prisma = getPrisma();
      const row = await prisma.appUser.findUnique({ where: { id } });
      return row ? mapDbUser(row) : null;
    } catch (err) {
      if (!isMissingUserTable(err)) throw err;
      const users = await readJsonUsers();
      return users.find((u) => u.id === id) || null;
    }
  }
  const users = await readJsonUsers();
  return users.find((u) => u.id === id) || null;
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const normalized = email.trim().toLowerCase();
  if (isNeonConfigured()) {
    try {
      const prisma = getPrisma();
      const row = await prisma.appUser.findUnique({ where: { email: normalized } });
      return row ? mapDbUser(row) : null;
    } catch (err) {
      if (!isMissingUserTable(err)) throw err;
      const users = await readJsonUsers();
      return users.find((u) => u.email === normalized) || null;
    }
  }
  const users = await readJsonUsers();
  return users.find((u) => u.email === normalized) || null;
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<AppUser | null> {
  await ensureDefaultAdmin();
  const user = await getUserByEmail(email);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  allowedEntityIds: string[];
}): Promise<AppUserPublic> {
  const email = input.email.trim().toLowerCase();
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const passwordHash = hashPassword(input.password);
  const createdAt = new Date().toISOString();
  const allowedEntityIds =
    input.role === "admin" ? [] : [...new Set(input.allowedEntityIds)];

  if (isNeonConfigured()) {
    try {
      const prisma = getPrisma();
      const existing = await prisma.appUser.findUnique({ where: { email } });
      if (existing) throw new Error("Email already registered");
      const row = await prisma.appUser.create({
        data: {
          id,
          email,
          name: input.name.trim() || email,
          passwordHash,
          role: input.role,
          allowedEntityIds,
        },
      });
      return toPublicUser(mapDbUser(row));
    } catch (err) {
      if (!isMissingUserTable(err)) throw err;
      // Fall through to JSON if Prisma table missing
    }
  }

  const users = await readJsonUsers();
  if (users.some((u) => u.email === email)) {
    throw new Error("Email already registered");
  }
  const user: AppUser = {
    id,
    email,
    name: input.name.trim() || email,
    passwordHash,
    role: input.role,
    allowedEntityIds,
    createdAt,
  };
  users.push(user);
  await writeJsonUsers(users);
  return toPublicUser(user);
}

export async function updateUser(
  id: string,
  patch: {
    name?: string;
    role?: UserRole;
    allowedEntityIds?: string[];
    password?: string;
  },
): Promise<AppUserPublic | null> {
  if (isNeonConfigured()) {
    try {
      const prisma = getPrisma();
      const existing = await prisma.appUser.findUnique({ where: { id } });
      if (!existing) return null;
      const role = patch.role ?? (existing.role as UserRole);
      const row = await prisma.appUser.update({
        where: { id },
        data: {
          name: patch.name ?? existing.name,
          role,
          allowedEntityIds:
            role === "admin"
              ? []
              : (patch.allowedEntityIds ?? existing.allowedEntityIds),
          ...(patch.password
            ? { passwordHash: hashPassword(patch.password) }
            : {}),
        },
      });
      return toPublicUser(mapDbUser(row));
    } catch (err) {
      if (!isMissingUserTable(err)) throw err;
    }
  }

  const users = await readJsonUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) return null;
  const role = patch.role ?? users[idx].role;
  users[idx] = {
    ...users[idx],
    name: patch.name ?? users[idx].name,
    role,
    allowedEntityIds:
      role === "admin" ? [] : (patch.allowedEntityIds ?? users[idx].allowedEntityIds),
    passwordHash: patch.password
      ? hashPassword(patch.password)
      : users[idx].passwordHash,
  };
  await writeJsonUsers(users);
  return toPublicUser(users[idx]);
}

export async function deleteUser(id: string): Promise<boolean> {
  if (isNeonConfigured()) {
    try {
      const prisma = getPrisma();
      const count = await prisma.appUser.count();
      const target = await prisma.appUser.findUnique({ where: { id } });
      if (!target) return false;
      if (target.role === "admin" && count <= 1) {
        throw new Error("Cannot delete the last admin");
      }
      await prisma.appUser.delete({ where: { id } });
      return true;
    } catch (err) {
      if (err instanceof Error && err.message.includes("last admin")) throw err;
      if (!isMissingUserTable(err)) throw err;
    }
  }

  const users = await readJsonUsers();
  const target = users.find((u) => u.id === id);
  if (!target) return false;
  const admins = users.filter((u) => u.role === "admin");
  if (target.role === "admin" && admins.length <= 1) {
    throw new Error("Cannot delete the last admin");
  }
  await writeJsonUsers(users.filter((u) => u.id !== id));
  return true;
}

export function defaultAdminCredentials(): { email: string; password: string } {
  return { email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD };
}
