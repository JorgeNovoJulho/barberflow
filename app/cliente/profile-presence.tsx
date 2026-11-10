"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export type Presence = { online: boolean; lastSeen: string | null };

export function ProfilePresence({ initial, profile, shop }: { initial: Presence; profile: string | null; shop: string | null }) {
  const [value, setValue] = useState<Presence | null>(initial);
  const [localTime, setLocalTime] = useState("");
  useEffect(() => {
    setValue(initial);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const supabase = createBrowserClient(url, key);
    let active = true;
    let checking = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || checking) return;
      checking = true;
      try {
        const { data, error } = await supabase.rpc("barberflow_profile_presence", { profile, shop_id: shop });
        if (active && !error) setValue(data);
      } finally { checking = false; }
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [initial, profile, shop]);
  useEffect(() => {
    setLocalTime(value?.lastSeen ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value.lastSeen)) : "");
  }, [value?.lastSeen]);

  if (!value) return null;
  return <p className="profile-presence"><span className={value.online ? "presence-dot online" : "presence-dot offline"} aria-hidden="true" />{value.online ? "Online" : "Offline"}{!value.online && localTime &&
    <> · Último acesso <time dateTime={value.lastSeen ?? undefined}>{localTime}</time></>}</p>;
}
