"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlatformData } from "@/lib/types";

export function usePlatform(options?: { omitLeads?: boolean }) {
  const omitLeads = options?.omitLeads || false;
  const [data, setData] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform${omitLeads ? "?leads=none" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load platform data");
      const json = (await res.json()) as PlatformData & {
        storageMode?: string;
      };
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [omitLeads]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  return { data, loading, error, refresh };
}
