"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlatform } from "@/hooks/use-platform";
import type { AppUserPublic, UserRole } from "@/lib/types";

type InviteShare = {
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  shareText: string;
  title: string;
};

type UserWithInvite = AppUserPublic & {
  temporaryPassword?: string;
  loginUrl?: string;
  shareText?: string;
  error?: string;
};

export default function UsersPage() {
  const { data, loading, error, refresh } = usePlatform();
  const [users, setUsers] = useState<AppUserPublic[]>([]);
  const [sessionRole, setSessionRole] = useState<UserRole | "anon">("anon");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [allowed, setAllowed] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [inviteShare, setInviteShare] = useState<InviteShare | null>(null);
  const [copied, setCopied] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoadErr(null);
    try {
      const [sessionRes, usersRes] = await Promise.all([
        fetch("/api/auth/session", { cache: "no-store" }),
        fetch("/api/users", { cache: "no-store" }),
      ]);
      const sessionJson = (await sessionRes.json()) as {
        user?: { role?: UserRole } | null;
      };
      setSessionRole(sessionJson.user?.role || "anon");
      if (!usersRes.ok) {
        const err = (await usersRes.json()) as { error?: string };
        throw new Error(err.error || "Could not load users (admin only)");
      }
      const json = (await usersRes.json()) as { users: AppUserPublic[] };
      setUsers(json.users);
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function toggleEntity(id: string) {
    setAllowed((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function showInviteFromResponse(json: UserWithInvite, title: string) {
    if (!json.temporaryPassword || !json.loginUrl || !json.shareText) return;
    setInviteShare({
      email: json.email,
      temporaryPassword: json.temporaryPassword,
      loginUrl: json.loginUrl,
      shareText: json.shareText,
      title,
    });
    setCopied(false);
  }

  async function copyShareText() {
    if (!inviteShare) return;
    try {
      await navigator.clipboard.writeText(inviteShare.shareText);
      setCopied(true);
      toast.success("Login instructions copied");
    } catch {
      toast.error("Could not copy — select the text manually");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          // Omit empty password so the API generates a temporary one.
          ...(password.trim() ? { password: password.trim() } : {}),
          role,
          allowedEntityIds: role === "admin" ? [] : allowed,
        }),
      });
      const json = (await res.json()) as UserWithInvite;
      if (!res.ok) throw new Error(json.error || "Create failed");
      toast.success("User created — share the login details below");
      showInviteFromResponse(json, "Share these login details now");
      setEmail("");
      setName("");
      setPassword("");
      setAllowed([]);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(user: AppUserPublic) {
    setResettingId(user.id);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, resetPassword: true }),
      });
      const json = (await res.json()) as UserWithInvite;
      if (!res.ok) throw new Error(json.error || "Reset failed");
      toast.success("Temporary password set — share it below");
      showInviteFromResponse(
        json,
        `New temporary password for ${user.email}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResettingId(null);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Delete failed");
      toast.success("User removed");
      const removed = users.find((u) => u.id === id);
      if (inviteShare && removed?.email === inviteShare.email) {
        setInviteShare(null);
      }
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  if (sessionRole !== "admin" && sessionRole !== "anon") {
    return (
      <ErrorPanel
        message="Only admins can manage users. Ask an admin for access."
        onRetry={loadUsers}
      />
    );
  }

  if (loadErr && sessionRole !== "anon") {
    return <ErrorPanel message={loadErr} onRetry={loadUsers} />;
  }

  return (
    <div>
      <PageHeader
        title="Users & access"
        description="Give teammates access to specific company portals only. The lead pool stays shared; campaigns, inbox, and reports stay isolated. No invite email is sent — copy the login details after create or reset."
      />

      {sessionRole === "anon" ? (
        <p className="mb-4 rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 text-sm text-[color:var(--ink-soft)]">
          Local open mode (not signed in) acts as admin.{" "}
          <a href="/login" className="underline">
            Sign in
          </a>{" "}
          — on Vercel, login is required by default. Default admin:{" "}
          AUTH_ADMIN_EMAIL (set AUTH_ADMIN_PASSWORD).
        </p>
      ) : null}

      {inviteShare ? (
        <div
          className="mb-8 space-y-3 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise"
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-xl">
                {inviteShare.title}
              </h2>
              <p className="mt-1 text-sm text-[color:var(--ink-soft)]">
                Shown once here. Passwords are hashed in the database and cannot
                be retrieved later — use Reset password if you lose this.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => void copyShareText()}>
              {copied ? (
                <>
                  <Check data-icon="inline-start" />
                  Copied
                </>
              ) : (
                <>
                  <Copy data-icon="inline-start" />
                  Copy instructions
                </>
              )}
            </Button>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[color:var(--ink-muted)]">Login URL</dt>
              <dd>
                <a
                  href={inviteShare.loginUrl}
                  className="underline break-all"
                  target="_blank"
                  rel="noreferrer"
                >
                  {inviteShare.loginUrl}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[color:var(--ink-muted)]">Email</dt>
              <dd className="font-medium">{inviteShare.email}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[color:var(--ink-muted)]">
                Temporary password
              </dt>
              <dd className="font-mono text-base tracking-wide">
                {inviteShare.temporaryPassword}
              </dd>
            </div>
          </dl>
          <pre className="overflow-x-auto rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--bg)] p-3 text-xs whitespace-pre-wrap text-[color:var(--ink-soft)]">
            {inviteShare.shareText}
          </pre>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setInviteShare(null)}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      <form
        onSubmit={create}
        className="mb-8 space-y-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise"
      >
        <h2 className="font-[family-name:var(--font-display)] text-xl">
          Add user
        </h2>
        <p className="text-sm text-[color:var(--ink-soft)]">
          Leave password blank to auto-generate a temporary one, then copy the
          login instructions to send manually (Slack, text, etc.).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Password (optional)</Label>
            <Input
              type="text"
              autoComplete="new-password"
              placeholder="Auto-generated if blank"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole((v as UserRole) || "member")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin (all entities)</SelectItem>
                <SelectItem value="member">Member (selected entities)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {role === "member" ? (
          <div className="space-y-2">
            <Label>Allowed entities</Label>
            <div className="flex flex-wrap gap-3">
              {data.brands.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allowed.includes(b.id)}
                    onChange={() => toggleEntity(b.id)}
                  />
                  {b.shortName}
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Create user"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Entities</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-[color:var(--ink-muted)]">
                    {u.email}
                  </div>
                </TableCell>
                <TableCell className="capitalize">{u.role}</TableCell>
                <TableCell className="text-sm text-[color:var(--ink-soft)]">
                  {u.role === "admin"
                    ? "All"
                    : u.allowedEntityIds
                        .map(
                          (id) =>
                            data.brands.find((b) => b.id === id)?.shortName ||
                            id,
                        )
                        .join(", ") || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resettingId === u.id}
                      onClick={() => void resetPassword(u)}
                    >
                      <RefreshCw data-icon="inline-start" />
                      {resettingId === u.id ? "Resetting…" : "Reset password"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void remove(u.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
