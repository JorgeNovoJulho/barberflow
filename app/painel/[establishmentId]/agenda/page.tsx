import { httpsUrl } from "../../../../lib/business-profile";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { offsetDay, saoPauloToday, validDay } from "../../../../lib/agenda";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { AppointmentFields } from "./appointment-fields";
import { appointmentAvatars, CancelAppointmentForm, CancellationFeedback, ClientAvatar } from "../appointment-card";
import { createEntry, linkCompletedClient, rescheduleEntry, updateEntry } from "./actions";

const messages: Record<string, string> = {
  salvo: "Registro adicionado à agenda.",
  atualizado: "Agenda atualizada.",
  remarcado: "Atendimento remarcado.",
  "cliente-vinculado": "Atendimento vinculado ao cadastro do cliente.",
  conflito: "Esse horário já está ocupado ou bloqueado para o profissional.",
  indisponivel: "Confira o expediente, os serviços vinculados ao profissional e se o cliente está ativo.",
  invalido: "Confira os campos e a ordem dos horários.",
  falha: "Não foi possível concluir a operação.",
};

const states: Record<string, string> = {
  pending: "Aguardando aprovação", scheduled: "Agendado", completed: "Concluído", cancelled: "Cancelado", no_show: "Não compareceu",
};

function entryTime(value: string, day: string) {
  const time = value.slice(11, 16);
  return value.startsWith(day) ? time : `${value.slice(8, 10)}/${value.slice(5, 7)} às ${time}`;
}

export default async function Agenda({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ dia?: string; cancelamento?: string; estado?: string; visao?: string; novo?: string; profissional?: string; servico?: string; horario?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const { dia, estado, cancelamento, visao, novo, profissional, servico, horario } = await searchParams;
  const today = saoPauloToday();
  const day = dia && validDay(dia) ? dia : today;
  const tomorrow = offsetDay(day, 1);
  const weekly = visao === "semana";
  const listView = visao === "lista";
  const view = weekly ? "semana" : listView ? "lista" : "dia";
  const monday = offsetDay(day, -((new Date(day).getUTCDay() + 6) % 7));
  const rangeStart = weekly ? monday : day;
  const rangeEnd = weekly ? offsetDay(monday, 7) : listView ? offsetDay(day, 7) : tomorrow;
  const path = `/painel/${shop}/agenda`;
  const href = (date: string, mode = view) => path + "?dia=" + date + (mode === "dia" ? "" : "&visao=" + mode);
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: href(day) }));
  const { data: establishment, error: establishmentError } = await supabase.from("barberflow_establishments")
    .select("name").eq("id", shop).maybeSingle();
  if (establishmentError) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!establishment) notFound();

  const [entries, professionals, services, assignments, clients] = await Promise.all([
    supabase.from("barberflow_schedule").select("id,professional_id,kind,state,starts_at,ends_at,service_name,client_id,client_name,client_phone,notes,booked_by")
      .eq("establishment_id", shop).lt("starts_at", rangeEnd + "T00:00").gt("ends_at", rangeStart + "T00:00").order("starts_at"),
    supabase.from("barberflow_professionals").select("id,name,active,photo_url").eq("establishment_id", shop).order("name"),
    supabase.from("barberflow_services").select("id,name,duration_minutes").eq("establishment_id", shop).eq("active", true).order("name"),
    supabase.from("barberflow_professional_services").select("professional_id,service_id").eq("establishment_id", shop),
    supabase.from("barberflow_clients").select("id,name").eq("establishment_id", shop).eq("active", true).order("name"),
  ]);
  const avatars = await appointmentAvatars(supabase, entries.data ?? []);
  const staff = professionals.data ?? [];
  const staffById = new Map(staff.map((person) => [person.id, person]));
  function providerLine(entry: { professional_id: string; kind: string; state: string }) {
    const person = staffById.get(entry.professional_id);
    const photo = httpsUrl(person?.photo_url);
    return <p className="agenda-provider">
      {photo && <img src={photo} alt="" width={36} height={36} loading="lazy" />}
      <span>{person?.name} · {entry.kind === "block" && entry.state === "scheduled" ? "Bloqueado" : states[entry.state]}</span>
    </p>;
  }
  const active = staff.filter((person) => person.active);
  const offerings = active.map((person) => {
    const allowed = new Set((assignments.data ?? []).filter((assignment) => assignment.professional_id === person.id).map((assignment) => assignment.service_id));
    return { id: person.id, name: person.name, services: (services.data ?? []).filter((service) => allowed.has(service.id)) };
  }).filter((person) => person.services.length);
  const suggestedProvider = novo === "1" ? offerings.find(({ id }) => id === profissional) : undefined;
  const suggestedService = suggestedProvider?.services.find(({ id }) => id === servico);
  const suggestedTime = suggestedService && typeof horario === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(horario) ? horario : "";
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(day));

  return <section className="container section">
    <nav className="account-links" aria-label="Estabelecimento">
      <Link href="/painel">Meus estabelecimentos</Link>
      <Link href={`/painel/${shop}/profissionais`}>Profissionais</Link>
      <Link href={`/painel/${shop}/clientes`}>Clientes</Link>
    </nav>
    <p className="eyebrow">{establishment.name}</p>
    <h1>Agenda</h1>
    <nav className="account-links" aria-label="Visão da agenda">
      <Link className="secondary" aria-current={view === "dia" ? "page" : undefined} href={href(day, "dia")}>Dia</Link>
      <Link className="secondary" aria-current={weekly ? "page" : undefined} href={href(day, "semana")}>Semana</Link>
      <Link className="secondary" aria-current={listView ? "page" : undefined} href={href(day, "lista")}>Lista</Link>
    </nav>
    <div className="agenda-toolbar">
      <Link className="secondary" href={href(offsetDay(day, weekly || listView ? -7 : -1))} data-agenda-tone="violet">Anterior</Link>
      <Link className="secondary" href={href(today)} data-agenda-tone="green">Hoje</Link>
      <Link className="secondary" href={href(offsetDay(day, weekly || listView ? 7 : 1))} data-agenda-tone="violet">Próximo</Link>
      <form className="agenda-date" action={path} method="get" key={`${view}-${day}`}>
        {view !== "dia" && <input type="hidden" name="visao" value={view} />}
        <label>Data <input type="date" name="dia" defaultValue={day} required /></label>
        <button type="submit" className="secondary" data-agenda-tone="blue">Abrir {view}</button>
      </form>
    </div>
    <p><Link className="primary" href={href(day, "dia") + "&novo=1#novo"}>+ Agendar para um cliente</Link></p>
    <CancellationFeedback state={cancelamento} />
    {estado && Object.hasOwn(messages, estado) && <p role="status">{messages[estado]}</p>}
    <h2>{weekly ? `Semana de ${monday.slice(5).split("-").reverse().join("/")}` : listView ? "Registros dos próximos 7 dias" : dateLabel}</h2>
    {[entries, professionals, services, assignments, clients].some((response) => response.error)
      ? <p role="alert">Não foi possível carregar a agenda.</p> : weekly ? <div className="week-grid">
        {Array.from({ length: 7 }, (_, index) => {
          const date = offsetDay(monday, index);
          const next = offsetDay(date, 1);
          const list = (entries.data ?? []).filter((entry) => entry.starts_at < next + "T00:00" && entry.ends_at > date + "T00:00");
          const label = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(date));
          return <section key={date} className="card">
            <h3><Link href={href(date, "dia")}>{label}</Link></h3>
            {list.length ? <ul>{list.map((entry) => <li key={entry.id}>
              {entryTime(entry.starts_at, date)} · {entry.kind === "block" ? "Bloqueio" : entry.service_name}
              {entry.state !== "scheduled" && ` · ${states[entry.state]}`}
            </li>)}</ul> : <p>Sem registros</p>}
          </section>;
        })}
      </div> : listView ? (
        entries.data?.length ? <ul className="cards">{entries.data.map((entry) => <li key={entry.id} className="card agenda-entry">
          <p className="agenda-entry-time">{entry.starts_at.slice(0, 10).split("-").reverse().join("/")} · {entry.starts_at.slice(11, 16)}</p>
          <h3>{entry.kind === "block" ? "Bloqueio de horário" : entry.service_name}</h3>
          {providerLine(entry)}
          {entry.client_name && <p>{entry.client_name}</p>}
          <Link href={href(entry.starts_at.slice(0, 10), "dia") + "#registro-" + entry.id}>Abrir registro no dia</Link>
        </li>)}</ul> : <p>Nenhum atendimento ou bloqueio neste período.</p>
      ) : <>
      <div className="agenda-forms">
        <details className="card" id="novo" open={novo === "1"}>
          <summary data-agenda-tone="green">Novo agendamento manual</summary>
          {offerings.length ? <form className="account-form" action={createEntry.bind(null, shop, day, "appointment", false)}>
            <AppointmentFields key={`${suggestedProvider?.id ?? ""}-${suggestedService?.id ?? ""}`} providers={offerings}
              initialProfessional={suggestedProvider?.id} initialService={suggestedService?.id} />
            <label>Horário <input key={suggestedTime} type="time" name="start" defaultValue={suggestedTime} required /></label>
            {!!clients.data?.length && <label>Cliente cadastrado <select name="client" defaultValue="">
              <option value="">Informar nome e WhatsApp abaixo</option>
              {clients.data.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select></label>}
            <label>Nome do cliente avulso <input name="customer" maxLength={120} required={!clients.data?.length} /></label>
            <label>WhatsApp do cliente avulso <input type="tel" name="phone" maxLength={30} /></label>
            <label>Observações <textarea name="note" maxLength={1000} rows={2} /></label>
            <SubmitButton>Agendar atendimento</SubmitButton>
          </form> : <p>Para agendar, <Link href={`/painel/${shop}/profissionais`}>vincule um serviço a um profissional ativo</Link>.</p>}
        </details>
        <details className="card">
          <summary data-agenda-tone="amber">Bloquear horário</summary>
          {active.length ? <form className="account-form" action={createEntry.bind(null, shop, day, "block", false)}>
            <label>Profissional <select name="professional" defaultValue="" required>
              <option value="" disabled>Selecione</option>
              {active.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select></label>
            <div className="form-columns">
              <label>Início <input type="time" name="start" required /></label>
              <label>Fim <input type="time" name="end" required /></label>
            </div>
            <label>Motivo <textarea name="note" maxLength={1000} rows={2} /></label>
            <SubmitButton>Bloquear horário</SubmitButton>
          </form> : <p>Cadastre um profissional ativo para bloquear horários.</p>}
        </details>
      </div>
      {entries.data?.length ? <ul className="cards">
        {entries.data.map((entry) => <li className="card agenda-entry" key={entry.id} id={`registro-${entry.id}`}>
          <p className="agenda-entry-time">{entry.starts_at.slice(0,10).split("-").reverse().join("/")} · {entryTime(entry.starts_at, day)}–{entryTime(entry.ends_at, day)}</p>
          <h3>{entry.kind === "block" ? "Bloqueio de horário" : entry.service_name}</h3>
          {providerLine(entry)}
          {entry.client_name && <p className="booking-client"><ClientAvatar photo={avatars.get(entry.id)} /><span>{entry.client_name}{entry.client_phone && ` · ${entry.client_phone}`}</span></p>}
          {entry.notes && <p>{entry.notes}</p>}
          {entry.kind === "appointment" && entry.state === "completed" && !entry.client_id && !!clients.data?.length &&
            <details><summary>Vincular ao cadastro do cliente</summary>
              <form className="account-form" action={linkCompletedClient.bind(null, shop, day, entry.id)}>
                <label>Cliente <select name="client" required defaultValue="">
                  <option value="" disabled>Selecione</option>
                  {clients.data.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select></label>
                <SubmitButton>Vincular atendimento</SubmitButton>
              </form>
            </details>}
          {entry.kind === "appointment" && (entry.state === "scheduled" || entry.state === "completed") &&
            <Link className="primary agenda-command" href={`/painel/${shop}/comanda/${entry.id}`}>Abrir comanda</Link>}
          {entry.state === "pending" && <div className="account-links">
            <form action={updateEntry.bind(null, shop, day, entry.id, "scheduled")}><SubmitButton>Aprovar reserva</SubmitButton></form>
            <CancelAppointmentForm shop={shop} day={day} entry={entry.id} />
          </div>}
          {entry.kind === "appointment" && entry.state === "scheduled" && <details>
            <summary>Remarcar atendimento</summary>
            <form className="account-form" action={rescheduleEntry.bind(null, shop, day, entry.id, false)}>
              <div className="form-columns">
                <label>Nova data <input type="date" name="date" defaultValue={entry.starts_at.slice(0, 10)} required /></label>
                <label>Novo horário <input type="time" name="start" defaultValue={entry.starts_at.slice(11, 16)} required /></label>
              </div>
              <SubmitButton>Salvar novo horário</SubmitButton>
            </form>
          </details>}
          {entry.state === "scheduled" && <div className="account-links">
            {entry.kind === "appointment" && <>
              <form action={updateEntry.bind(null, shop, day, entry.id, "completed")}><SubmitButton tone="keep">Concluir</SubmitButton></form>
              <form action={updateEntry.bind(null, shop, day, entry.id, "no_show")}><SubmitButton tone="cancel">Marcar falta</SubmitButton></form>
            </>}
            {entry.kind === "block" ? <form action={updateEntry.bind(null, shop, day, entry.id, "cancelled")}>
              <SubmitButton>Desbloquear</SubmitButton>
            </form> : <CancelAppointmentForm shop={shop} day={day} entry={entry.id} />}
          </div>}
        </li>)}
      </ul> : <p>Nenhum atendimento ou bloqueio neste dia.</p>}
    </>}
  </section>;
}
