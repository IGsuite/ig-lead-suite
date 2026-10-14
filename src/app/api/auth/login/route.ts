import { NextResponse } from "next/server";
import {
  encodeSession,
  sessionCookieOptions,
  sessionFromUser,
  toPublicUser,
  SESSION_COOKIE,
} from "@/lib/auth";
import { authenticateUser, ensureDefaultAdmin } from "@/lib/users-store";

export async function POST(request: Request) {
  await ensureDefaultAdmin();
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 },
    );
  }
  const user = await authenticateUser(body.email, body.password);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const token = encodeSession(sessionFromUser(user));
  const res = NextResponse.json({ user: toPublicUser(user) });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
