"use client";

import { useEffect, useState } from "react";

/** Pathname without usePathname() — avoids Cache Components Suspense hangs. */
export function useClientPathname() {
  const [pathname, setPathname] = useState("");

  useEffect(() => {
    const read = () => setPathname(window.location.pathname);
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
