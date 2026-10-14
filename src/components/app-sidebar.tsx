"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  FerrisWheel,
  Inbox,
  LayoutDashboard,
  Images,
  ListChecks,
  LogIn,
  LogOut,
  Megaphone,
  Settings,
  ShieldOff,
  UserCog,
  Users,
} from "lucide-react";
import { useClientPathname } from "@/hooks/use-client-pathname";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/creatives", label: "Ads", icon: Images },
  { href: "/autopilot", label: "Autopilot", icon: FerrisWheel },
  { href: "/brands", label: "Entities", icon: Building2 },
  { href: "/setup", label: "Go live", icon: ListChecks },
  { href: "/opt-outs", label: "Opt-outs", icon: ShieldOff },
  { href: "/users", label: "Users", icon: UserCog },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = useClientPathname();
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { user?: { email?: string } | null }) => {
        setSessionEmail(json.user?.email || null);
      })
      .catch(() => undefined);
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[color:var(--ink-border)] bg-[color:var(--panel)]">
      <div className="border-b border-[color:var(--ink-border)] px-5 py-5">
        <Link href="/dashboard" className="block">
          <div className="font-[family-name:var(--font-display)] text-xl leading-tight tracking-tight text-[color:var(--ink)] sm:text-2xl">
            {PRODUCT_NAME}
          </div>
          <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
            {PRODUCT_TAGLINE}
          </p>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-[color:var(--ink)] text-white"
                  : "text-[color:var(--ink-soft)] hover:bg-[color:var(--panel-hover)] hover:text-[color:var(--ink)]",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[color:var(--ink-border)] p-4 text-xs text-[color:var(--ink-muted)]">
        {sessionEmail ? (
          <div className="mb-2 space-y-2">
            <div className="truncate text-[color:var(--ink-soft)]">
              {sessionEmail}
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center gap-2 text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="mb-2 flex items-center gap-2 text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]"
          >
            <LogIn className="size-3.5" /> Sign in
          </Link>
        )}
        Upload once · verify · rotate · never mix brands.
      </div>
    </aside>
  );
}
