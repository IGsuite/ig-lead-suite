"use client";

import { usePathname } from "next/navigation";

/**
 * Active pathname for client nav highlighting.
 *
 * Uses next/navigation usePathname — Cache Components was the original hang
 * source (Suspense around AppShell + usePathname). That mode is off and the
 * shell no longer wraps in Suspense, so the framework hook is safe and avoids
 * history.pushState/replaceState monkey-patches that conflict with Next Link
 * useInsertionEffect ("must not schedule updates").
 */
export function useClientPathname() {
  return usePathname();
}
