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

export function resolveLoginUrl(): string {
  const base = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (base) return `${base}/login`;
  return DEFAULT_LOGIN_URL;
}

export type InviteSharePayload = {
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  /** Plain text the admin can copy/paste to the teammate. */
  shareText: string;
};

export function buildInviteShare(input: {
  email: string;
  temporaryPassword: string;
  name?: string;
}): InviteSharePayload {
  const loginUrl = resolveLoginUrl();
  const greeting = input.name?.trim()
    ? `Hi ${input.name.trim()},`
    : "Hi,";
  const shareText = [
    greeting,
    "",
    "You have access to IG Lead Suite. Sign in with:",
    "",
    `Login: ${loginUrl}`,
    `Email: ${input.email.trim().toLowerCase()}`,
    `Temporary password: ${input.temporaryPassword}`,
    "",
    "Please change your password after first login (ask an admin to reset if needed).",
  ].join("\n");

  return {
    email: input.email.trim().toLowerCase(),
    temporaryPassword: input.temporaryPassword,
    loginUrl,
    shareText,
  };
}
