"use client";

import { ErrorPanel } from "@/components/state-panels";

export default function AdsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      message={error.message || "Ads library failed to load"}
      onRetry={reset}
    />
  );
}
