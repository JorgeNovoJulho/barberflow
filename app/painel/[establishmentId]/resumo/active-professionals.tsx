"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Person = { id: string; name: string; photo_url: string | null; started_at: string | null };

function duration(now: number, started: string) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(started)) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min em atividade` : `${minutes} min em atividade`;
}

export function ActiveProfessionals({ shop }: { shop: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [now, setNow] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const client = createBrowserClient(url, key);
    let mounted = true;
    let pending = false;
    const refresh = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const { data, error } = await client.rpc("barberflow_working_professionals", { shop_id: shop });
        if (!mounted) return;
        setFailed(Boolean(error));
        if (!error) { setPeople(data ?? []); setNow(Date.now()); }
      } catch {
        if (mounted) setFailed(true);
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [shop]);

  return <div className="card dashboard-metric">
    <dt>Profissionais em atividade</dt>
    <dd>{people?.length ?? "—"}</dd>
    {failed ? <p>Não foi possível atualizar a atividade.</p> : people?.length ? <ul className="finance-entry-list">{people.map((person) =>
      <li className="subscription-business" key={person.id}>
        {person.photo_url?.startsWith("https://") ? <img src={person.photo_url} alt="" width={36} height={36} loading="lazy" />
          : <span aria-hidden="true">{person.name.slice(0, 1)}</span>}
        <div>{person.name}<br /><small>{person.started_at ? duration(now, person.started_at) : "Início não registrado"}</small></div>
      </li>)}</ul> : <p>{people ? "Nenhum profissional iniciou o dia." : "Consultando atividade…"}</p>}
  </div>;
}
