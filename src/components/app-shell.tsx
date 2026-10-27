"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PRODUCT_NAME } from "@/lib/brand";
import { SeoAlertBanner } from "@/components/seo-alert-banner";
import { ThemePreference } from "@/components/theme-preferences";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[color:var(--canvas)] text-[color:var(--ink)]">
      <div className="hidden lg:block">
        <div className="sticky top-0 h-screen">
          <AppSidebar />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[color:var(--ink-border)] bg-[color:var(--panel)]/80 px-4 py-3 backdrop-blur lg:hidden">
          <div>
            <div className="font-[family-name:var(--font-display)] text-lg leading-tight text-[color:var(--ink)]">
              {PRODUCT_NAME}
            </div>
            <p className="text-xs text-[color:var(--ink-muted)]">Ops desk</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div onClick={() => setOpen(false)}>
                <AppSidebar />
              </div>
            </SheetContent>
          </Sheet>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8"><div className="mb-4 flex items-center justify-end gap-3"><ThemePreference /><SeoAlertBanner /></div>{children}</main>
      </div>
    </div>
  );
}
