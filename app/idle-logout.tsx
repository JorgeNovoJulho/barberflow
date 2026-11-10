"use client";

import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

const idleLimit = 30 * 60_000;

export function IdleLogout({ user }: { user: string }) {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const supabase = createBrowserClient(url, key);
    const storageKey = "barberflow.activity." + user;
    let last = Date.now();
    let exiting = false;
    let timer: number;
    const shared = () => {
      try { return Number(localStorage.getItem(storageKey)) || 0; } catch { return 0; }
    };
    const remember = () => {
      try { localStorage.setItem(storageKey, String(last)); } catch { }
    };
    const saved = shared();
    if (saved) last = saved;
    else remember();

    function check() {
      if (exiting) return;
      window.clearTimeout(timer);
      last = Math.max(last, shared());
      const remaining = idleLimit - (Date.now() - last);
      if (remaining <= 0) {
        exiting = true;
        void supabase.auth.signOut({ scope: "local" }).finally(() => window.location.replace("/"));
      } else {
        timer = window.setTimeout(check, remaining);
      }
    }
    function activity(event: Event) {
      if (!event.isTrusted || exiting || Date.now() - last < 1_000) return;
      check();
      if (exiting) return;
      last = Date.now();
      remember();
      check();
    }
    function sync(event: StorageEvent) {
      if (event.key === storageKey) check();
    }
    const events = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"];
    events.forEach((event) => window.addEventListener(event, activity, { passive: true }));
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("storage", sync);
    check();
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, activity));
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", sync);
    };
  }, [user]);
  return null;
}
