import { BookingForm } from "../../estabelecimento/[slug]/agendar/booking-form";
import type { PublicProfile } from "../../../lib/public-booking";
import { offsetDay } from "../../../lib/agenda";
import { PurchaseUpdates } from "../../minhas-compras/purchase-updates";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saoPauloToday, validDay } from "../../../lib/agenda";
import { isUuid } from "../../../lib/establishments";
import { supabaseServer } from "../../../lib/supabase";
import { SubmitButton } from "../../auth/submit";
import { AppointmentFields, type Provider } from "../../painel/[establishmentId]/agenda/appointment-fields";
import { createEntry, rescheduleEntry } from "../../painel/[establishmentId]/agenda/actions";

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

async function bookForTeam(shop: string, form: FormData) {
  "use server";
  const day = String(form.get("day") ?? "");
  if (!validDay(day)) notFound();
  form.set("start", String(form.get("slot") ?? ""));
  return createEntry(shop, day, "appointment", true, form);
}

type Entry = { id: string; professional_name: string; kind: string; state: string; starts_at: string; ends_at: string;
  service_name: string | null; client_name: string | null; can_edit: boolean };
type Offering = { professional_id: string; professional_name: string; service_id: string; service_name: string; duration_minutes: number };

export default async function TeamAgenda({ params, searchParams }: {
  params: Promise<{ shop: string }>; searchParams: Promise<{ dia?: string; estado?: string; novo?: string }>;
}) {
  const { shop } = await params;
  if (!isUuid(shop)) notFound();
  const { dia, estado, novo } = await searchParams;
  const day = typeof dia === "string" && validDay(dia) ? dia : saoPauloToday();
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: `/equipe/${shop}` }));
  const [memberships, agenda, offerings, clientAccess, serviceAccess, professionalAccess, financeAccess, bookingNotices, individual, bookingContext] = await Promise.all([
    supabase.rpc("barberflow_my_team_shops"),
    supabase.rpc("barberflow_team_agenda", { shop, agenda_day: day }),
    supabase.rpc("barberflow_team_offerings", { shop }),
    supabase.rpc("barberflow_team_can_edit_clients", { shop }),
    supabase.rpc("barberflow_team_can_edit_services", { shop }),
    supabase.rpc("barberflow_team_can_edit_professionals", { shop }),
    supabase.rpc("barberflow_team_finance_status", { shop }),
    supabase.rpc("barberflow_team_booking_notifications", { shop }),
    supabase.rpc("barberflow_professional_panel", { shop_id: shop, period: "dia" }),
    supabase.rpc("barberflow_team_booking_context", { shop_id: shop }),
  ]);
  if (memberships.error) throw new Error("Não foi possível consultar os acessos da equipe.");
  const business = (memberships.data as { id: string; name: string }[]).find((item) => item.id === shop);
  if (!business) notFound();
  const wizard = bookingContext.data as { slug: string | null; limit_days: number; services: PublicProfile["services"] } | null;
  const today = saoPauloToday();
  const limit = offsetDay(today, wizard?.limit_days ?? 30);
  const entries = (agenda.data ?? []) as Entry[];
  const providers = new Map<string, Provider>();
  for (const row of (offerings.data ?? []) as Offering[]) {
    const person = providers.get(row.professional_id) ?? { id: row.professional_id, name: row.professional_name, services: [] };
    person.services.push({ id: row.service_id, name: row.service_name, duration_minutes: row.duration_minutes });
    providers.set(person.id, person);
  }
  return <section className="container section">
    <PurchaseUpdates />
    <Link href={individual.data ? `/equipe/${shop}/meu-painel` : "/painel"}>Voltar ao painel</Link>
    <p className="eyebrow">{business.name}</p><h1>Agenda da equipe</h1>
    {individual.data && <p><Link className="primary" href={`/equipe/${shop}/meu-painel`}>Meu painel profissional</Link></p>}
    {clientAccess.data === true && <p><Link className="secondary" href={`/equipe/${shop}/clientes`}>Clientes da equipe</Link></p>}
    {serviceAccess.data === true && <p><Link className="secondary" href={`/equipe/${shop}/servicos`}>Serviços e preços</Link></p>}
    {professionalAccess.data === true && <p><Link className="secondary" href={`/equipe/${shop}/profissionais`}>Profissionais</Link></p>}
    {financeAccess.data && financeAccess.data !== "denied" && <p><Link className="secondary" href={`/equipe/${shop}/financeiro`}>Financeiro e relatórios</Link></p>}
    {bookingNotices.error ? <p role="alert">Não foi possível carregar os avisos de agendamento.</p>
      : bookingNotices.data?.length > 0 && <section className="card panel-form">
        <h2>Novos agendamentos online nas últimas 24 horas</h2>
        <ul>{bookingNotices.data.map((entry: { id: string; service_name: string; client_name: string; starts_at: string }) => <li key={entry.id}>
          <Link href={`/equipe/${shop}?dia=${entry.starts_at.slice(0,10)}`}>{entry.service_name} · {entry.client_name} · {entry.starts_at.slice(0,10).split("-").reverse().join("/")} às {entry.starts_at.slice(11,16)}</Link>
        </li>)}</ul>
      </section>}
    <form className="agenda-date">
      <label>Data <input type="date" name="dia" defaultValue={day} required /></label>
      <button type="submit" className="secondary">Abrir dia</button>
    </form>
    {(estado === "salvo" || estado === "remarcado") && <p role="status">{estado === "remarcado" ? "Atendimento remarcado." : "Agenda atualizada."}</p>}
    {estado === "falha" && <p role="alert">Não foi possível concluir a operação.</p>}
    {estado === "invalido" && <p role="alert">Confira os campos do atendimento.</p>}
    {estado === "indisponivel" && <p role="alert">Confira o expediente e os serviços do profissional.</p>}
    {estado === "conflito" && <p role="alert">Este horário já está ocupado ou bloqueado.</p>}
    {bookingContext.error ? <p role="alert">Não foi possível consultar os serviços disponíveis.</p> : wizard &&
      <details className="card team-booking" id="novo-atendimento" open={novo === "1"}><summary>Novo atendimento</summary>
        <BookingForm teamShop={shop} slug={wizard.slug ?? ""} services={wizard.services}
          initialService="" initialPerson="" day={day >= today && day <= limit ? day : today}
          today={today} limit={limit} initialSlots={null} initialName="" action={bookForTeam.bind(null, shop)} requestId={crypto.randomUUID()} />
      </details>}
    {agenda.error ? <p role="alert">Não foi possível consultar a agenda.</p> : entries.length ? <ul className="professional-appointments">
      {entries.map((item) => <li className="card" data-state={item.state} key={item.id}>
        <h2>{item.kind === "block" ? "Horário bloqueado" : item.service_name}</h2>
        <p>{item.professional_name} · {item.starts_at.slice(11, 16)}–{item.ends_at.slice(11, 16)} · {states[item.state]}</p>
        {item.client_name && <p>{item.client_name}</p>}
        {item.can_edit && item.state === "scheduled" && <details><summary>Remarcar atendimento</summary>
          <form className="account-form" action={rescheduleEntry.bind(null, shop, day, item.id, true)}>
            <label>Nova data <input type="date" name="date" defaultValue={item.starts_at.slice(0, 10)} required /></label>
            <label>Novo horário <input type="time" name="start" defaultValue={item.starts_at.slice(11, 16)} required /></label>
            <SubmitButton>Salvar novo horário</SubmitButton>
          </form>
        </details>}
        {item.can_edit && <div className="account-links">
          {(item.state === "scheduled" ? [["no_show", "Marcar falta"], ["cancelled", "Cancelar"]]
            : item.state === "pending" ? [["scheduled", "Aprovar"], ["cancelled", "Recusar"]] : []).map(([state, label]) =>
              <form key={state} action={setState.bind(null, shop, item.id, day, state)}><SubmitButton tone={state === "cancelled" && label === "Cancelar" ? "cancel" : undefined}>{label}</SubmitButton></form>)}
        </div>}
      </li>)}
    </ul> : <p>Nenhum registro disponível neste dia.</p>}
  </section>;
}
