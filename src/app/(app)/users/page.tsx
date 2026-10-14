"use client";

import { useCallback, useEffect, useState } from "react";
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
          password,
          role,
          allowedEntityIds: role === "admin" ? [] : allowed,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Create failed");
      toast.success("User created");
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

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Delete failed");
      toast.success("User removed");
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
        description="Give teammates access to specific company portals only. The lead pool stays shared; campaigns, inbox, and reports stay isolated."
      />

      {sessionRole === "anon" ? (
        <p className="mb-4 rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 text-sm text-[color:var(--ink-soft)]">
          Open mode (not signed in) acts as admin.{" "}
          <a href="/login" className="underline">
            Sign in
          </a>{" "}
          or set <code>AUTH_REQUIRED=true</code> to require login. Default
          admin: admin@signaldesk.local
        </p>
      ) : null}

      <form
        onSubmit={create}
        className="mb-8 space-y-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise"
      >
        <h2 className="font-[family-name:var(--font-display)] text-xl">
          Add user
        </h2>
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
            <Label>Password</Label>
            <Input
              type="password"
              required
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void remove(u.id)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
