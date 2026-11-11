import { httpsUrl } from "../../../../lib/business-profile";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { offsetDay, saoPauloToday, validDay } from "../../../../lib/agenda";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { AgendaIcon } from "../agenda-icon";
import { AppointmentFields } from "./appointment-fields";
import { appointmentAvatars, CancelAppointmentForm, CancellationFeedback, ClientAvatar } from "../appointment-card";
import { archiveCancelled, createEntry, linkCompletedClient, rescheduleEntry, updateEntry } from "./actions";

const messages: Record<string, string> = {
  arquivados: "Agendamentos cancelados removidos da lista.",
  salvo: "Registro adicionado à agenda.",
  atualizado: "Agenda atualizada.",
  remarcado: "Atendimento remarcado.",
  "cliente-vinculado": "Atendimento vinculado ao cadastro do cliente.",
  conflito: "Esse horário já está ocupado ou bloqueado para o profissional.",
  indisponivel: "Confira o expediente, os serviços vinculados ao profissional e se o cliente está ativo.",
  invalido: "Confira os campos e a ordem dos horários.",
  "limite-plano": "O plano Pro permite até 8 agendamentos por dia. Escolha outra data.",
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
  searchParams: Promise<{ dia?: string; periodo?: string; cancelamento?: string; estado?: string; visao?: string; novo?: string; profissional?: string; servico?: string; horario?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const { dia, periodo, estado, cancelamento, visao, novo, profissional, servico, horario } = await searchParams;
  const today = saoPauloToday();
  const day = dia && validDay(dia) ? dia : today;
  const tomorrow = offsetDay(day, 1);
  const weekly = visao === "semana";
  const monthly = visao === "mes" || visao === "lista";
  const cancelled = visao === "cancelados";
  const cancelledPeriod = periodo === "1" || periodo === "7" || periodo === "30" ? Number(periodo) : null;
  const cancelledStart = cancelledPeriod ? offsetDay(day, 1 - cancelledPeriod) : null;
  const view = cancelled ? "cancelados" : weekly ? "semana" : monthly ? "mes" : "dia";
  const monthStart = day.slice(0, 7) + "-01";
  const monthEnd = offsetDay(monthStart, 32).slice(0, 7) + "-01";
  const previousMonth = offsetDay(monthStart, -1).slice(0, 7) + "-01";
  const monday = offsetDay(day, -((new Date(day).getUTCDay() + 6) % 7));
  const rangeStart = weekly ? monday : monthly ? monthStart : day;
  const rangeEnd = weekly ? offsetDay(monday, 7) : monthly ? monthEnd : tomorrow;
  const path = `/painel/${shop}/agenda`;
  const href = (date: string, mode = view) => path + "?dia=" + date + (mode === "dia" ? "" : "&visao=" + mode);
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: href(day) }));
  const { data: establishment, error: establishmentError } = await supabase.from("barberflow_establishments")
    .select("name").eq("id", shop).maybeSingle();
  if (establishmentError) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!establishment) notFound();

  const cutoff = new Date().toISOString();
  const schedule = supabase.from("barberflow_schedule").select("id,professional_id,kind,state,starts_at,ends_at,service_name,client_id,client_name,client_phone,notes,booked_by")
    .eq("establishment_id", shop);
  const cancelledEntries = cancelled
    ? schedule.eq("kind", "appointment").eq("state", "cancelled").is("cancelled_card_archived_at", null)
    : null;
  if (cancelledEntries && cancelledStart) {
    cancelledEntries.gte("starts_at", cancelledStart + "T00:00").lt("starts_at", tomorrow + "T00:00");
  }
  const [entries, professionals, services, assignments, clients] = await Promise.all([
    cancelledEntries
      ? cancelledEntries.order("starts_at", { ascending: false }).order("id")
      : schedule.neq("state", "cancelled").lt("starts_at", rangeEnd + "T00:00").gt("ends_at", rangeStart + "T00:00").order("starts_at"),
    supabase.from("barberflow_professionals").select("id,name,active,photo_url").eq("establishment_id", shop).order("name"),
    supabase.from("barberflow_services").select("id,name,duration_minutes").eq("establishment_id", shop).eq("active", true).order("name"),
    supabase.from("barberflow_professional_services").select("professional_id,service_id").eq("establishment_id", shop),
    supabase.from("barberflow_clients").select("id,name").eq("establishment_id", shop).eq("active", true).order("name"),
  ]);
  const avatars = monthly || weekly ? new Map<string, string>() : await appointmentAvatars(supabase, entries.data ?? []);
  const monthlyEntries = new Map<string, NonNullable<typeof entries.data>>();
  if (monthly) {
    for (const entry of entries.data ?? []) {
      if (entry.kind !== "appointment" || entry.state === "cancelled") continue;
      const date = entry.starts_at.slice(0, 10);
      const items = monthlyEntries.get(date) ?? [];
      items.push(entry);
      monthlyEntries.set(date, items);
    }
  }
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
  const dayFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" });
  const dateLabel = dayFormat.format(new Date(day));
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(monthStart));

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
      <Link className="secondary" aria-current={monthly ? "page" : undefined} href={href(day, "mes")}>Mês</Link>
      <Link className="secondary" aria-current={cancelled ? "page" : undefined} href={href(day, "cancelados")}>Cancelados</Link>
    </nav>
    {!cancelled && <div className="agenda-toolbar">
      <Link className="secondary" href={href(monthly ? previousMonth : offsetDay(day, weekly ? -7 : -1))} data-agenda-tone="violet">Anterior</Link>
      <Link className="secondary" href={href(today)} data-agenda-tone="green">Hoje</Link>
      <Link className="secondary" href={href(monthly ? monthEnd : offsetDay(day, weekly ? 7 : 1))} data-agenda-tone="violet">Próximo</Link>
      <form className="agenda-date" action={path} method="get" key={`${view}-${day}`}>
        {view !== "dia" && <input type="hidden" name="visao" value={view} />}
        <label>Data <input type="date" name="dia" defaultValue={day} required /></label>
        <button type="submit" className="secondary" data-agenda-tone="blue">Abrir {monthly ? "mês" : view}</button>
      </form>
    </div>}
    {!cancelled && <p><Link className="primary" href={href(day, "dia") + "&novo=1#novo"}>+ Agendar para um cliente</Link></p>}
    <CancellationFeedback state={cancelamento} />
    {estado && Object.hasOwn(messages, estado) && <p role="status">{messages[estado]}</p>}
    <h2>{cancelled ? "Agendamentos cancelados" : weekly ? `Semana de ${monday.slice(5).split("-").reverse().join("/")}` : monthly ? monthLabel : dateLabel}</h2>
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
      </div> : monthly ? <div className="agenda-month">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((name) => <span key={name} className="agenda-month-weekday">{name}</span>)}
        {Array.from({ length: (new Date(monthStart).getUTCDay() + 6) % 7 }, (_, index) => <span key={index} className="agenda-month-empty" aria-hidden="true" />)}
        {Array.from({ length: Number(offsetDay(monthEnd, -1).slice(8)) }, (_, index) => {
          const date = offsetDay(monthStart, index);
          const appointments = monthlyEntries.get(date) ?? [];
          return <section className="agenda-month-day" data-booked={appointments.some(({ state }) => state === "scheduled" || state === "completed")} key={date}>
            <Link className="agenda-month-date" href={href(date, "dia")} aria-current={date === today ? "date" : undefined} aria-label={dayFormat.format(new Date(date))}>{index + 1}</Link>
            {!!appointments.length && <ul>{appointments.map((entry) => <li key={entry.id}>
              <Link href={href(date, "dia") + "#registro-" + entry.id}>
                <strong>{entry.starts_at.slice(11,16)}</strong> {entry.service_name}
                {entry.state !== "scheduled" && <small>{states[entry.state]}</small>}
              </Link>
            </li>)}</ul>}
          </section>;
        })}
      </div> : <>
      {cancelled && cancelledStart && <p>
      {cancelledStart.split("-").reverse().join("/")} a {day.split("-").reverse().join("/")} · <Link href={href(day, "cancelados")}>Ver todos os períodos</Link>
    </p>}
    {cancelled && !cancelledStart && !!entries.data?.length && <details className="card panel-form">
        <summary className="secondary action-cancel">Limpar todos</summary>
        <p>Remover todos os agendamentos cancelados desta lista?</p>
        <form action={archiveCancelled.bind(null, shop, day, cutoff)}>
          <SubmitButton tone="cancel">Confirmar limpeza</SubmitButton>
        </form>
      </details>}
      {!cancelled && <div className="agenda-forms">
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
      </div>}
      {entries.data?.length ? <ul className="cards">
        {entries.data.map((entry) => <li className="card agenda-entry" key={entry.id} id={`registro-${entry.id}`}>
          <p className="agenda-entry-time">{entry.starts_at.slice(0,10).split("-").reverse().join("/")} · {entryTime(entry.starts_at, day)}–{entryTime(entry.ends_at, day)}</p>
          <h3>{entry.kind === "block" ? "Bloqueio de horário" : entry.service_name}</h3>
          {providerLine(entry)}
          {entry.client_name && <p className="booking-client"><ClientAvatar photo={avatars.get(entry.id)} /><span>{entry.client_name}{entry.client_phone && ` · ${entry.client_phone}`}</span></p>}
          {entry.notes && <p>{entry.notes}</p>}
          <div className="agenda-entry-actions">
          {entry.kind === "appointment" && entry.state === "completed" && !entry.client_id && !!clients.data?.length &&
            <details><summary className="secondary agenda-card-button"><AgendaIcon name="person" />Vincular cliente</summary>
              <form className="account-form" action={linkCompletedClient.bind(null, shop, day, entry.id)}>
                <label>Cliente <select name="client" required defaultValue="">
                  <option value="" disabled>Selecione</option>
                  {clients.data.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select></label>
                <SubmitButton className="agenda-card-button" icon={<AgendaIcon name="person" />}>Vincular atendimento</SubmitButton>
              </form>
            </details>}
          {entry.kind === "appointment" && (entry.state === "scheduled" || entry.state === "completed") &&
            <Link className="primary agenda-command agenda-card-button" href={`/painel/${shop}/comanda/${entry.id}`}><AgendaIcon name="receipt" />Abrir comanda</Link>}
          {entry.state === "pending" && <>
            <form action={updateEntry.bind(null, shop, day, entry.id, "scheduled")}><SubmitButton className="agenda-card-button" tone="keep" icon={<AgendaIcon name="check" />}>Aprovar reserva</SubmitButton></form>
            <CancelAppointmentForm shop={shop} day={day} entry={entry.id} />
          </>}
          {entry.kind === "appointment" && entry.state === "scheduled" && <details>
            <summary className="secondary agenda-card-button agenda-reschedule-button"><AgendaIcon name="calendar" />Remarcar atendimento</summary>
            <form className="account-form" action={rescheduleEntry.bind(null, shop, day, entry.id, false)}>
              <div className="form-columns">
                <label>Nova data <input type="date" name="date" defaultValue={entry.starts_at.slice(0, 10)} required /></label>
                <label>Novo horário <input type="time" name="start" defaultValue={entry.starts_at.slice(11, 16)} required /></label>
              </div>
              <SubmitButton className="agenda-card-button" icon={<AgendaIcon name="calendar" />}>Salvar novo horário</SubmitButton>
            </form>
          </details>}
          {entry.state === "scheduled" && <>
            {entry.kind === "appointment" && <>
              <form action={updateEntry.bind(null, shop, day, entry.id, "completed")}><SubmitButton className="agenda-card-button" icon={<AgendaIcon name="check" />} tone="keep">Concluir</SubmitButton></form>
              <form action={updateEntry.bind(null, shop, day, entry.id, "no_show")}><SubmitButton className="agenda-card-button" icon={<AgendaIcon name="absent" />} tone="cancel">Marcar falta</SubmitButton></form>
            </>}
            {entry.kind === "block" ? <form action={updateEntry.bind(null, shop, day, entry.id, "cancelled")}>
              <SubmitButton className="agenda-card-button" icon={<AgendaIcon name="unlock" />}>Desbloquear</SubmitButton>
            </form> : <CancelAppointmentForm shop={shop} day={day} entry={entry.id} />}
          </>}
          </div>
        </li>)}
      </ul> : <p>{cancelled ? "Nenhum agendamento cancelado nesta lista." : "Nenhum atendimento ou bloqueio neste dia."}</p>}
    </>}
  </section>;
}
