"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PurchaseUpdates({ interval = 30_000 }: { interval?: number }) {
  const router = useRouter();

  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "visible") router.refresh();
    }
    const timer = window.setInterval(refresh, interval);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, interval]);

  return null;
}
