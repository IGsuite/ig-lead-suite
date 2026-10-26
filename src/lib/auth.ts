import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { AppUser, AppUserPublic, UserRole } from "@/lib/types";

export const SESSION_COOKIE = "sd_session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type SessionPayload = {
  userId: string;
  email: string;
  role: UserRole;
  allowedEntityIds: string[];
  exp: number;
};

function authSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) {
    if (isProductionDeploy() && secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
    return secret;
  }
  if (isProductionDeploy()) throw new Error("AUTH_SECRET is required in production");
  return "signaldesk-local-dev-secret";
}

/** True on Vercel or NODE_ENV=production (Edge-safe env checks only). */
export function isProductionDeploy(): boolean {
  return (
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
  );
}

/**
 * When auth is required, unauthenticated visitors are redirected to /login
 * (middleware). Webhooks and a few health routes stay public.
 *
 * Defaults:
 * - Vercel / production → always required
 * - Local → open for demos (unless AUTH_REQUIRED=true)
 */
export function isAuthRequired(): boolean {
  if (isProductionDeploy()) return true;
  const v = process.env.AUTH_REQUIRED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return isProductionDeploy();
}

export function hashPassword(password: string, salt?: string): string {
  const s = salt || randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 64).toString("hex");
  return `${s}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function sign(payloadB64: string): string {
  return createHmac("sha256", authSecret()).update(payloadB64).digest("hex");
}

export function encodeSession(payload: SessionPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function decodeSession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;
  try {
    const expected = sign(payloadB64);
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const json = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (typeof json.exp !== "number" || !Number.isFinite(json.exp) || json.exp < Date.now()) return null;
    if (!json.userId || !json.email || !["admin", "member", "setup"].includes(json.role)) return null;
    return {
      ...json,
      allowedEntityIds: Array.isArray(json.allowedEntityIds)
        ? json.allowedEntityIds
        : [],
    };
  } catch {
    return null;
  }
}

export function sessionFromUser(user: AppUser): SessionPayload {
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    allowedEntityIds: user.allowedEntityIds,
    exp: Date.now() + SESSION_TTL_MS,
  };
}

export function toPublicUser(user: AppUser): AppUserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    allowedEntityIds: user.allowedEntityIds,
    createdAt: user.createdAt,
  };
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const session = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  // Revoked users and changed permissions take effect immediately.
  const { getUserById } = await import("@/lib/users-store");
  const user = await getUserById(session.userId);
  return user ? { ...sessionFromUser(user), exp: session.exp } : null;
}

export function sessionCookieOptions(maxAgeSeconds = SESSION_TTL_MS / 1000) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
