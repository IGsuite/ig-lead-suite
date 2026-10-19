import { randomBytes } from "crypto";

/** Production login page used in share copy when PUBLIC_APP_URL is unset. */
export const DEFAULT_LOGIN_URL = "https://www.igleadsuite.com/login";

const TEMP_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * Human-shareable temporary password (no ambiguous 0/O/1/l).
 * Cryptographically random — suitable for one-time admin handoff.
 */
export function generateTemporaryPassword(length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[bytes[i]! % TEMP_PASSWORD_ALPHABET.length];
  }
  return out;
}

/** Base login URL (no query). Prefer PUBLIC_APP_URL when set. */
export function resolveLoginBaseUrl(): string {
  const base = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (base) return `${base}/login`;
  return DEFAULT_LOGIN_URL;
}

/**
 * Login URL that prefills the email field via `?email=`.
 * Password is still shared separately — no magic-link token in this flow.
 */
export function resolveLoginUrl(email?: string): string {
  const loginPath = resolveLoginBaseUrl();
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return loginPath;
  return `${loginPath}?email=${encodeURIComponent(trimmed)}`;
}

export type InviteSharePayload = {
  email: string;
  temporaryPassword: string;
  /** Prefills email on the login page (`/login?email=...`). */
  loginUrl: string;
  /** Same as loginUrl — alias for shareable invite link wording. */
  inviteLink: string;
  /** Plain text the admin can copy/paste to the teammate. */
  shareText: string;
  /** Compact field dump for "Copy all". */
  copyAllText: string;
};

export function buildInviteShare(input: {
  email: string;
  temporaryPassword: string;
  name?: string;
}): InviteSharePayload {
  const email = input.email.trim().toLowerCase();
  const loginUrl = resolveLoginUrl(email);
  const greeting = input.name?.trim()
    ? `Hi ${input.name.trim()},`
    : "Hi,";
  const shareText = [
    greeting,
    "",
    "You have access to IG Lead Suite. Sign in with:",
    "",
    `Login: ${loginUrl}`,
    `Email: ${email}`,
    `Temporary password: ${input.temporaryPassword}`,
    "",
    "Open the link (email is prefilled), enter the temporary password, then ask an admin to reset if you need a new one.",
  ].join("\n");

  const copyAllText = [
    `Login: ${loginUrl}`,
    `Email: ${email}`,
    `Temporary password: ${input.temporaryPassword}`,
  ].join("\n");

  return {
    email,
    temporaryPassword: input.temporaryPassword,
    loginUrl,
    inviteLink: loginUrl,
    shareText,
    copyAllText,
  };
}
