"use client";

import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function AccountActivity() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const supabase = createBrowserClient(url, key);
    const touch = () => {
      if (document.visibilityState === "visible") void supabase.rpc("barberflow_touch_activity").then(() => {});
    };
    touch();
    const timer = window.setInterval(touch, 60_000);
    document.addEventListener("visibilitychange", touch);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", touch);
    };
  }, []);
  return null;
}
