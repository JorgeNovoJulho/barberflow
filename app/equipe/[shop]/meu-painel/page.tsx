import { appointmentAvatars, ClientAvatar } from "../../../painel/[establishmentId]/appointment-card";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isUuid } from "../../../../lib/establishments";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";

const periods = { dia: "Dia", semana: "Semana", quinzena: "Quinzenal", mes: "Mensal" };
type Appointment = { id: string; client: string; phone: string | null; service: string; starts: string; state: string; checked_in?: boolean; booked_by: string | null };
type Panel = {
  name: string; business: string; photo: string | null; cover: string | null; today: string;
  available: boolean; services: string[]; service_rate: number; product_rate: number;
  appointments: Appointment[]; attended: number; absent: number; paid_services: number; sold_products: number;
  hours: { weekday: number; hour: number; quantity: number }[];
  daily: { services: number; products: number; service_units: number; product_units: number; service_commission: number; product_commission: number };
};
const money = (value: number) => bookingCurrency.format(value / 100);
const dayLabel = (value: string) => value.slice(0, 10).split("-").reverse().join("/");
const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

async function client(shop: string) {
  if (!isUuid(shop)) notFound();
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: `/equipe/${shop}/meu-painel` }));
  return supabase;
}

async function changeDay(shop: string, available: boolean) {
  "use server";
  const supabase = await client(shop);
  const { data, error } = await supabase.rpc("barberflow_set_professional_day", { shop_id: shop, available_now: available });
  revalidatePath(`/equipe/${shop}/meu-painel`);
  redirect(`/equipe/${shop}/meu-painel?estado=${data && !error ? "salvo" : "falha"}`);
}

async function appointmentAction(shop: string, id: string, operation: "cancel" | "absence", form: FormData) {
  "use server";
  if (!isUuid(id)) notFound();
  const supabase = await client(shop);
  const reason = String(form.get("reason") ?? "").trim();
  const { data, error } = await supabase.rpc("barberflow_professional_appointment", {
    shop_id: shop, entry_id: id, operation, reason: reason || null,
  });
  revalidatePath(`/equipe/${shop}/meu-painel`);
  redirect(`/equipe/${shop}/meu-painel?estado=${data && !error ? "salvo" : "falha"}#agenda-dia`);
}

async function checkIn(shop: string, id: string, openOrder: boolean) {
  "use server";
  if (!isUuid(id)) notFound();
  const supabase = await client(shop);
  const { data, error } = await supabase.rpc("barberflow_professional_check_in", { shop_id: shop, entry_id: id });
  if (openOrder && data && !error) redirect(`/equipe/${shop}/comanda/${id}`);
  revalidatePath(`/equipe/${shop}/meu-painel`);
  redirect(`/equipe/${shop}/meu-painel?estado=${data && !error ? "salvo" : "falha"}#agenda-dia`);
}

function media(value: string | null) {
  return value?.startsWith("https://") ? value : undefined;
}

export default async function ProfessionalPanel({ params, searchParams }: {
  params: Promise<{ shop: string }>;
  searchParams: Promise<{ periodo?: string; agenda?: string; estado?: string; pagina?: string }>;
}) {
  const { shop } = await params;
  const supabase = await client(shop);
  const { periodo, agenda, estado, pagina } = await searchParams;
  const period = typeof periodo === "string" && Object.hasOwn(periods, periodo) ? periodo : "dia";
  const agendaPeriod = typeof agenda === "string" && Object.hasOwn(periods, agenda) ? agenda : "dia";
  const [{ data, error }, counterResult, agendaResult, bookingContext] = await Promise.all([
    supabase.rpc("barberflow_professional_panel", { shop_id: shop, period }),
    supabase.rpc("barberflow_professional_counter_metrics", { shop_id: shop, period }),
    supabase.rpc("barberflow_professional_agenda_period", { shop_id: shop, agenda_period: agendaPeriod }),
    supabase.rpc("barberflow_team_booking_context", { shop_id: shop }),
  ]);
  if (error) throw new Error("Não foi possível carregar seu painel.");
  if (!data) notFound();
  const panel = data as Panel;
  const counter = counterResult.data as (Pick<Panel, "paid_services" | "sold_products" | "daily"> & { checked_in: string[]; attended_open: number }) | null;
  const checkedIn = new Set(counter?.checked_in ?? []);
  if (counter) {
    panel.paid_services += counter.paid_services;
    panel.sold_products += counter.sold_products;
    for (const key of Object.keys(panel.daily) as (keyof Panel["daily"])[]) panel.daily[key] += counter.daily[key];
  }
  const base = `/equipe/${shop}/meu-painel`;
  const appointments = (agendaResult.data ?? []) as Appointment[];
  const page = typeof pagina === "string" && /^\d{1,4}$/.test(pagina) ? Math.min(Number(pagina), Math.max(0, Math.ceil(appointments.length / 12) - 1)) : 0;
  const visibleAppointments = appointments.slice(page * 12, page * 12 + 12);
  const avatars = await appointmentAvatars(supabase, visibleAppointments);
  const publicSlug = bookingContext.data?.slug;
  return <section className="container section professional-workspace">
    <Link href={`/equipe/${shop}`}>Agenda da equipe</Link>
    <header className="card professional-identity">
      <div className="professional-cover">{media(panel.cover) && <img src={media(panel.cover)} alt="" decoding="async" />}</div>
      {media(panel.photo) && <img className="professional-photo" src={media(panel.photo)} alt="" loading="lazy" width={72} height={72} />}
      <p className="eyebrow">{panel.business}</p>
      <h1>{panel.name}</h1>
      <p>{panel.services.length ? panel.services.join(" · ") : "Sem serviços vinculados."}</p>
      <p>Comissão de serviços {panel.service_rate / 100}% · Comissão de produtos {panel.product_rate / 100}%</p>
      <p><strong>{panel.available ? "Disponível hoje" : "Indisponível hoje"}</strong></p>
      <nav className="account-links" aria-label="Ações do profissional">
        <Link className="primary" href={`${base}?agenda=dia#agenda-dia`}>Abrir agenda</Link>
        <Link className="secondary" href={`/equipe/${shop}?dia=${panel.today}&novo=1#novo-atendimento`}>Novo atendimento</Link>
        {publicSlug && <Link className="secondary professional-public-link" href={`/estabelecimento/${publicSlug}`}>Página pública</Link>}
      {panel.available ? <details><summary className="secondary">Fechar Dia</summary>
        <form action={changeDay.bind(null, shop, false)}>
          <p>Fechar a disponibilidade para novos agendamentos online de hoje?</p>
          <SubmitButton>Confirmar fechamento</SubmitButton>
        </form>
      </details> : <form action={changeDay.bind(null, shop, true)}><SubmitButton>Iniciar Dia</SubmitButton></form>}
      </nav>
    </header>
    {estado && <p role={estado === "salvo" ? "status" : "alert"}>{estado === "salvo" ? "Alteração salva." : "Não foi possível concluir a operação."}</p>}
    {counterResult.error && <p role="status">Não foi possível incluir as vendas de balcão nos totais.</p>}
    <div className="professional-daily">
      <section className="card"><h2>Serviços hoje</h2><p>{panel.daily.service_units} · {money(panel.daily.services)}</p>
        <strong>A receber {money(panel.daily.service_commission)}</strong></section>
      <section className="card"><h2>Produtos hoje</h2><p>{panel.daily.product_units} · {money(panel.daily.products)}</p>
        <strong>A receber {money(panel.daily.product_commission)}</strong></section>
    </div>
    <details className="card" id="agenda-dia" open={Boolean(agenda || estado || page)}>
      <summary>Agendamentos · {appointments.length}</summary>
      <nav className="account-links" aria-label="Período da agenda">{Object.entries(periods).map(([key, label]) =>
        <Link key={key} className="secondary" aria-current={agendaPeriod === key ? "page" : undefined}
          href={`${base}?periodo=${period}&agenda=${key}#agenda-dia`}>{label}</Link>)}</nav>
      {agendaResult.error ? <p role="alert">Não foi possível carregar os agendamentos.</p>
        : !appointments.length && <p>Nenhum agendamento neste período.</p>}
      <ul className="finance-entry-list">{visibleAppointments.map((entry, index) => {
        const digits = entry.phone?.replace(/\D/g, "") ?? "";
        return <li className="card team-professional-card" data-tone={index % 4} key={entry.id}>
          <strong>{dayLabel(entry.starts)} às {entry.starts.slice(11,16)}</strong>
          <h3 className="subscription-business"><ClientAvatar photo={avatars.get(entry.id)} />{entry.client}</h3><p>{entry.service}</p>
          {digits && <a href={`https://wa.me/${digits.length <= 11 ? "55" + digits : digits}`}>WhatsApp</a>}
          {(entry.state === "scheduled" || entry.state === "pending") && <div className="finance-entry-actions">
            {entry.state === "scheduled" && (entry.checked_in || entry.starts.startsWith(panel.today)) && ((entry.checked_in || checkedIn.has(entry.id)) ? <strong>Presença confirmada</strong>
              : <form action={checkIn.bind(null, shop, entry.id, false)}><SubmitButton>Confirmar presença</SubmitButton></form>)}
            {entry.state === "scheduled" && (entry.checked_in || entry.starts.startsWith(panel.today)) && ((entry.checked_in || checkedIn.has(entry.id))
              ? <Link className="primary" href={`/equipe/${shop}/comanda/${entry.id}`}>Abrir comanda</Link>
              : <form action={checkIn.bind(null, shop, entry.id, true)}><SubmitButton>Abrir comanda</SubmitButton></form>)}
            <details><summary className="agenda-absence-button">Falta</summary><form action={appointmentAction.bind(null, shop, entry.id, "absence")}>
              <SubmitButton>Confirmar falta</SubmitButton></form></details>
            <details><summary className="agenda-cancel-button">Cancelar cliente</summary><form className="account-form" action={appointmentAction.bind(null, shop, entry.id, "cancel")}>
              <label>Motivo <textarea name="reason" maxLength={500} required /></label><SubmitButton>Confirmar cancelamento</SubmitButton>
            </form></details>
          </div>}
        </li>;
      })}</ul>
      {page > 0 && <Link className="secondary" href={`${base}?periodo=${period}&agenda=${agendaPeriod}&pagina=${page-1}#agenda-dia`}>Anterior</Link>}
      {(page + 1) * 12 < appointments.length && <Link className="secondary" href={`${base}?periodo=${period}&agenda=${agendaPeriod}&pagina=${page+1}#agenda-dia`}>Próxima</Link>}
    </details>
    <section className="card" id="desempenho">
      <h2>Desempenho</h2>
      <nav className="account-links" aria-label="Período do desempenho">{Object.entries(periods).map(([key, label]) =>
        <Link key={key} className="secondary" aria-current={period === key ? "page" : undefined} href={`${base}?periodo=${key}&agenda=${agendaPeriod}#desempenho`}>{label}</Link>)}</nav>
      <dl>
        <dt>Serviços fechados e pagos</dt><dd>{panel.paid_services}</dd>
        <dt>Comparecimentos</dt><dd>{panel.attended + (counter?.attended_open ?? 0)}</dd>
        <dt>Faltas</dt><dd>{panel.absent}</dd>
        <dt>Produtos vendidos</dt><dd>{panel.sold_products}</dd>
      </dl>
      <h3>Dias e horários de pico</h3>
      {panel.hours.length ? <ul className="professional-peaks">{panel.hours.map(({ weekday, hour, quantity }) =>
        <li key={weekday * 24 + hour}><span>{days[weekday - 1]} · {hour}h</span><meter min={0} max={Math.max(...panel.hours.map((row) => row.quantity))} value={quantity} aria-label="Atendimentos concluídos" /><strong>{quantity}</strong></li>)}</ul>
        : <p>Sem atendimentos concluídos no período.</p>}
    </section>
  </section>;
}
