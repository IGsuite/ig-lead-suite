"use client";

import { startTransition, useEffect, useState } from "react";

/** Pathname without usePathname() — avoids Cache Components Suspense hangs. */
export function useClientPathname() {
  const [pathname, setPathname] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "",
  );

  useEffect(() => {
    const read = () => {
      const next = window.location.pathname;
      // Defer: history patches can run inside useInsertionEffect (Next Link).
      startTransition(() => {
        setPathname((prev) => (prev === next ? prev : next));
      });
    };

    // Hydration often starts as ""; sync once without blocking insertion effects.
    read();

    const onPop = () => read();
    window.addEventListener("popstate", onPop);

    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...args) => {
      origPush(...args);
      read();
    };
    history.replaceState = (...args) => {
      origReplace(...args);
      read();
    };

    return () => {
      window.removeEventListener("popstate", onPop);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  }, []);

  return pathname;
}
