"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AgendaRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function refresh() {
      if (!document.hidden && !pending && !document.activeElement?.closest("#agenda-dia form")) {
        startTransition(() => router.refresh());
      }
    }
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, pending]);

  return null;
}
