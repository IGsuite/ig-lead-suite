import { NextResponse } from "next/server";
import { assertEntityAccess, isAdminSession } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import {
  buildInviteShare,
  generateTemporaryPassword,
} from "@/lib/invite-credentials";
import type { UserRole } from "@/lib/types";
import {
  createUser,
  deleteUser,
  ensureDefaultAdmin,
  listUsers,
  updateUser,
} from "@/lib/users-store";

export async function GET() {
  await ensureDefaultAdmin();
  const session = await getSession();
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(request: Request) {
  await ensureDefaultAdmin();
  const session = await getSession();
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = (await request.json()) as {
    email?: string;
    name?: string;
    password?: string;
    role?: UserRole;
    allowedEntityIds?: string[];
  };
  if (!body.email?.trim()) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }
  const temporaryPassword =
    body.password?.trim() || generateTemporaryPassword();
  const role: UserRole = body.role === "admin" ? "admin" : "member";
  const allowedEntityIds = body.allowedEntityIds || [];
  if (role === "member") {
    for (const id of allowedEntityIds) {
      const gate = assertEntityAccess(session, id);
      // admins always pass; keep loop for future nested roles
      if (!gate.ok && session) {
        return NextResponse.json({ error: gate.error }, { status: gate.status });
      }
    }
  }
  try {
    const name = body.name || body.email;
    const user = await createUser({
      email: body.email,
      name,
      password: temporaryPassword,
      role,
      allowedEntityIds,
    });
    const invite = buildInviteShare({
      email: user.email,
      temporaryPassword,
      name: user.name,
    });
    // No invite email is sent — admin must copy/share these credentials once.
    return NextResponse.json({
      ...user,
      temporaryPassword: invite.temporaryPassword,
      loginUrl: invite.loginUrl,
      shareText: invite.shareText,
      inviteEmailSent: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = (await request.json()) as {
    id?: string;
    name?: string;
    role?: UserRole;
    allowedEntityIds?: string[];
    password?: string;
    /** When true, generate a fresh temporary password and return share copy. */
    resetPassword?: boolean;
  };
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const temporaryPassword = body.resetPassword
    ? body.password?.trim() || generateTemporaryPassword()
    : body.password?.trim() || undefined;

  const user = await updateUser(body.id, {
    name: body.name,
    role: body.role,
    allowedEntityIds: body.allowedEntityIds,
    password: temporaryPassword,
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (temporaryPassword) {
    const invite = buildInviteShare({
      email: user.email,
      temporaryPassword,
      name: user.name,
    });
    return NextResponse.json({
      ...user,
      temporaryPassword: invite.temporaryPassword,
      loginUrl: invite.loginUrl,
      shareText: invite.shareText,
      inviteEmailSent: false,
    });
  }

  return NextResponse.json(user);
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  try {
    const ok = await deleteUser(id);
    if (!ok) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 400 },
    );
  }
}
