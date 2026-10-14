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
    /** Only expose bootstrap hint when still on default local admin setup */
    bootstrapHint:
      !session && process.env.NODE_ENV !== "production"
        ? { email: creds.email, passwordHint: "see AUTH_ADMIN_PASSWORD or changeme" }
        : null,
  });
}
