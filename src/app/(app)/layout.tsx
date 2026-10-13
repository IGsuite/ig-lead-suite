import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingPanel } from "@/components/state-panels";

export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
