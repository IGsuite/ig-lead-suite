"use client";

import Link from "next/link";
import {
  BarChart3,
  Building2,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Settings,
  ShieldOff,
  Users,
} from "lucide-react";
import { useClientPathname } from "@/hooks/use-client-pathname";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/leads", label: "Shared lead pool", icon: Users },
  { href: "/brands", label: "Entities", icon: Building2 },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/inbox", label: "Reply inbox", icon: Inbox },
  { href: "/results", label: "Results by source", icon: BarChart3 },
  { href: "/opt-outs", label: "Opt-outs", icon: ShieldOff },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = useClientPathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[color:var(--ink-border)] bg-[color:var(--panel)]">
      <div className="border-b border-[color:var(--ink-border)] px-5 py-5">
        <Link href="/dashboard" className="block">
          <div className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[color:var(--ink)]">
            SignalDesk
          </div>
          <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
            One backend · multi-entity offers
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
        Shared pool feeds all five entity portals.
      </div>
    </aside>
  );
}
