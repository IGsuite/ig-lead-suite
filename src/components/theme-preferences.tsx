"use client";
import { ThemeProvider, useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
export function ThemePreferencesProvider({ children }: { children: React.ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="ig-lead-suite-theme" disableTransitionOnChange>{children}</ThemeProvider>;
}
export function ThemePreference() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return <label className="flex items-center gap-2 text-xs text-[color:var(--ink-muted)]"><span>Appearance</span><select aria-label="Appearance" value={mounted ? theme || "light" : "light"} disabled={!mounted} onChange={event => setTheme(event.target.value)} className="rounded-lg border border-[color:var(--ink-border)] bg-[color:var(--panel)] px-2 py-2 text-[color:var(--ink)]"><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>;
}
