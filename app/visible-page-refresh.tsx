"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export function VisiblePageRefresh({ pauseWithin }: { pauseWithin?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function refresh() {
      if (!document.hidden && !pending && (!pauseWithin || !document.activeElement?.closest(pauseWithin))) {
        startTransition(() => router.refresh());
      }
    }
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, pending, pauseWithin]);

  return null;
}
