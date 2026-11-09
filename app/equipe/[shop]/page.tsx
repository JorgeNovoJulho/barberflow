import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saoPauloToday, validDay } from "../../../lib/agenda";
import { isUuid } from "../../../lib/establishments";
import { supabaseServer } from "../../../lib/supabase";
import { SubmitButton } from "../../auth/submit";

const states: Record<string, string> = {
  pending: "Aguardando confirmação", scheduled: "Agendado", completed: "Concluído", cancelled: "Cancelado", no_show: "Não compareceu",
};

async function setState(shop: string, id: string, day: string, state: string) {
  "use server";
  if (!isUuid(shop) || !isUuid(id) || !validDay(day) || !Object.hasOwn(states, state)) notFound();
  const path = `/equipe/${shop}?dia=${day}`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  const { data, error } = await supabase.rpc("barberflow_set_schedule_state", { shop, entry: id, new_state: state });
  redirect(path + "&estado=" + (data && !error ? "salvo" : "falha"));
}

type Entry = { id: string; professional_name: string; kind: string; state: string; starts_at: string; ends_at: string;
  service_name: string | null; client_name: string | null; can_edit: boolean };

export default async function TeamAgenda({ params, searchParams }: {
  params: Promise<{ shop: string }>; searchParams: Promise<{ dia?: string; estado?: string }>;
}) {
  const { shop } = await params;
  if (!isUuid(shop)) notFound();
  const { dia, estado } = await searchParams;
  const day = typeof dia === "string" && validDay(dia) ? dia : saoPauloToday();
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: `/equipe/${shop}` }));
  const [memberships, agenda] = await Promise.all([
    supabase.rpc("barberflow_my_team_shops"),
    supabase.rpc("barberflow_team_agenda", { shop, agenda_day: day }),
  ]);
  if (memberships.error) throw new Error("Não foi possível consultar os acessos da equipe.");
  const business = (memberships.data as { id: string; name: string }[]).find((item) => item.id === shop);
  if (!business) notFound();
  const entries = (agenda.data ?? []) as Entry[];
  return <section className="container section">
    <Link href="/painel">Voltar ao painel</Link>
    <p className="eyebrow">{business.name}</p><h1>Agenda da equipe</h1>
    <form className="agenda-date">
      <label>Data <input type="date" name="dia" defaultValue={day} required /></label>
      <button type="submit" className="secondary">Abrir dia</button>
    </form>
    {estado === "salvo" && <p role="status">Atendimento atualizado.</p>}
    {estado === "falha" && <p role="alert">Não foi possível alterar este atendimento.</p>}
    {agenda.error ? <p role="alert">Não foi possível consultar a agenda.</p> : entries.length ? <ul className="cards">
      {entries.map((item) => <li className="card" key={item.id}>
        <h2>{item.kind === "block" ? "Horário bloqueado" : item.service_name}</h2>
        <p>{item.professional_name} · {item.starts_at.slice(11, 16)}–{item.ends_at.slice(11, 16)} · {states[item.state]}</p>
        {item.client_name && <p>{item.client_name}</p>}
        {item.can_edit && <div className="account-links">
          {(item.state === "scheduled" ? [["completed", "Concluir"], ["no_show", "Marcar falta"], ["cancelled", "Cancelar"]]
            : item.state === "pending" ? [["scheduled", "Aprovar"], ["cancelled", "Recusar"]] : []).map(([state, label]) =>
              <form key={state} action={setState.bind(null, shop, item.id, day, state)}><SubmitButton>{label}</SubmitButton></form>)}
        </div>}
      </li>)}
    </ul> : <p>Nenhum registro disponível neste dia.</p>}
  </section>;
}
