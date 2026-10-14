import { NextResponse } from "next/server";
import { getSession, isAuthRequired, toPublicUser } from "@/lib/auth";
import {
  defaultAdminCredentials,
  ensureDefaultAdmin,
  getUserById,
  listUsers,
} from "@/lib/users-store";

export async function GET() {
  await ensureDefaultAdmin();
  const session = await getSession();
  const user = session ? await getUserById(session.userId) : null;
  const users = await listUsers();
  const creds = defaultAdminCredentials();
  return NextResponse.json({
    authRequired: isAuthRequired(),
    user: user ? toPublicUser(user) : null,
    userCount: users.length,
    /** Only expose bootstrap hint for local demos — never password values */
    bootstrapHint:
      !session && process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1"
        ? {
            email: creds.email,
            passwordHint: creds.passwordConfigured
              ? "see AUTH_ADMIN_PASSWORD or SITE_ACCESS_CODE"
              : "set AUTH_ADMIN_PASSWORD (local default: changeme)",
          }
        : null,
  });
}
