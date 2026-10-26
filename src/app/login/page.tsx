"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromLink = searchParams.get("email")?.trim() || "";
  const [email, setEmail] = useState(
    () => emailFromLink || "admin@signaldesk.local",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json()) as { error?: string;user?:{role?:string} };
      if (!res.ok) throw new Error(json.error || "Login failed");
      const next = searchParams.get("next") || "/dashboard";
      router.push(json.user?.role==="setup"?"/company-setup":next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--canvas)] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-8 shadow-sm"
      >
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
            {PRODUCT_NAME}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
            {PRODUCT_TAGLINE}. Sign in with your email and password.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-xs text-[color:var(--ink-muted)]">
            Production requires AUTH_ADMIN_PASSWORD (and AUTH_SECRET) in env.
            Optional SITE_ACCESS_CODE works as the admin passcode.
          </p>
        )}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          Loading…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
