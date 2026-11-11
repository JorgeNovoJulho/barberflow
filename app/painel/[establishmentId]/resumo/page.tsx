import { appointmentAvatars, CancelAppointmentForm, CancellationFeedback, ClientAvatar } from "../appointment-card";
import { AgendaIcon } from "../agenda-icon";
import { AppointmentReminder } from "./appointment-reminder";
import { httpsUrl } from "../../../../lib/business-profile";
import type { Closing, OpenSales } from "../caixa/model";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { markBookingNotifications } from "./notification-actions";

const periods = [{ days: 1, label: "Hoje" }, { days: 7, label: "7 dias" }, { days: 30, label: "30 dias" }];

type BookingNotifications = { unread: number; as_of: string; items: {
  id: string; kind?: "booking" | "cancellation" | "showcase_order"; client_name: string; service_name: string; starts_at: string | null; booking_created_at: string; booking_read_at: string | null;
}[] };

type Dashboard = {
  first_day: string; today: string; appointments: number; completed: number; cancelled: number; no_show: number;
  pending: number; online: number; scheduled_cents: number; confirmed_cents: number; active_clients: number;
  previous_appointments: number; upcoming_count: number; free_slots: number | null; slot_service: string | null;
  marked_today: number; completed_today: number; in_progress: number; pending_today: number; received_today: number | null;
  upcoming: { id: string; starts_at: string; client_name: string; service_name: string; professional_name: string; professional_photo?: string; state: string }[];
};

function formatDay(day: string) {
  return day.slice(0, 10).split("-").reverse().join("/");
}

function DashboardCharts({ data }: { data: Dashboard }) {
  const states = [
    { label: "Concluídos", count: data.completed, color: "#12a878" },
    { label: "Cancelados", count: data.cancelled, color: "#f59b26" },
    { label: "Não compareceram", count: data.no_show, color: "#ec5787" },
    { label: "Aguardando aprovação", count: data.pending, color: "#2485ed" },
    { label: "Demais atendimentos", count: Math.max(0, data.appointments - data.completed - data.cancelled - data.no_show - data.pending), color: "#7852ed" },
  ];
  const total = states.reduce((sum, item) => sum + item.count, 0);
  let angle = 0;
  const bands = states.filter(({ count }) => count > 0).map(({ count, color }) => {
    const start = angle;
    angle += count / total * 360;
    return `${color} ${start}deg ${angle}deg`;
  });
  const peak = Math.max(1, data.appointments, data.previous_appointments);
  return <div className="dashboard-chart-grid">
    <section className="card dashboard-chart">
      <h3>Situação dos atendimentos</h3>
      <div className="dashboard-chart-content">
        <div className="dashboard-ring" aria-hidden="true" style={bands.length ? { background: `conic-gradient(${bands.join(",")})` } : undefined}>
          <div><strong>{total}</strong><small>Total</small></div>
        </div>
        <ul>{states.map(({ label, count, color }) => <li key={label}>
          <span className="dashboard-legend-dot" style={{ background: color }} aria-hidden="true" />
          <span>{label}</span><strong>{count}</strong>
        </li>)}</ul>
      </div>
    </section>
    <section className="card dashboard-chart dashboard-comparison">
      <h3>Comparativo de agendamentos</h3>
      {[["Período atual", data.appointments], ["Período anterior", data.previous_appointments]].map(([label, count]) =>
        <label key={label}><span>{label} <strong>{count}</strong></span>
          <meter min={0} max={peak} value={Number(count)} />
        </label>)}
    </section>
  </div>;
}

export default async function DashboardPage({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ periodo?: string; cancelamento?: string; notificacoes?: string; guiaAviso?: string; aviso?: string; comanda?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const { periodo, cancelamento, notificacoes, guiaAviso, aviso, comanda } = await searchParams;
  const selected = periods.find(({ days }) => String(days) === periodo) ?? periods[0];
  const path = `/painel/${shop}/resumo`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path + "?periodo=" + selected.days }));
  const [shopResult, report, notificationResult, openSalesResult, cardSalesResult, newOrdersResult] = await Promise.all([
    supabase.from("barberflow_establishments").select("name").eq("id", shop).maybeSingle(),
    supabase.rpc("barberflow_dashboard", { shop, period_days: selected.days }),
    supabase.rpc("barberflow_booking_notifications", { shop }),
    supabase.rpc("barberflow_counter_open", { shop_id:shop,page_number:0 }),
    supabase.rpc("barberflow_counter_report", { shop_id:shop,period:"dia",item_filter:"ambos",page_number:0 }),
    supabase.from("barberflow_showcase_orders").select("id", { count: "exact", head: true })
      .eq("establishment_id", shop).eq("status", "pending").gt("expires_at", new Date().toISOString()),
  ]);
  if (shopResult.error) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!shopResult.data) notFound();
  const openSales = openSalesResult.data as OpenSales|null;
  const cardSales = cardSalesResult.data as Closing|null;
  const checkout = `/painel/${shop}/caixa`;
  const data = report.data as Dashboard | null;
  const upcoming = Array.isArray(data?.upcoming) ? data.upcoming : [];
  const upcomingIds = upcoming.map(({ id }) => id);
  const upcomingEntries = upcomingIds.length ? await supabase.from("barberflow_schedule").select("id,booked_by").eq("establishment_id", shop).in("id", upcomingIds) : null;
  const avatars = await appointmentAvatars(supabase, upcomingEntries?.data ?? []).catch(() => new Map<string, string>());
  const [freeTimes, flagged] = data ? await Promise.all([
    supabase.rpc("barberflow_dashboard_free_times", { shop }),
    supabase.from("barberflow_schedule").select("id,starts_at,service_name,client_name,state")
      .eq("establishment_id", shop).eq("kind", "appointment").in("state", ["no_show", "pending"])
      .gte("starts_at", data.first_day + "T00:00").lte("starts_at", data.today + "T23:59:59.999999")
      .order("starts_at", { ascending: false }),
  ]) : [];
  const noticeData = notificationResult.data as BookingNotifications | null;
  const notifications = Array.isArray(noticeData?.items) ? noticeData : null;
  const readNotices = guiaAviso === "lidas";
  const visibleNotices = notifications?.items.filter((item) => Boolean(item.booking_read_at) === readNotices).sort((a, b) => Date.parse(b.booking_created_at) - Date.parse(a.booking_created_at)) ?? [];
  const noticeLink = (guide: string) => `?periodo=${selected.days}&notificacoes=1&guiaAviso=${guide}#notificacoes`;
  const money = (cents: number) => bookingCurrency.format(cents / 100);
  const percentage = (part: number, total: number) => new Intl.NumberFormat("pt-BR", {
    style: "percent", maximumFractionDigits: 1,
  }).format(total ? part / total : 0);
  const indicators = data ? [
    { label: "Agendamentos", value: data.appointments, note: data.previous_appointments
      ? `${percentage(data.appointments - data.previous_appointments, data.previous_appointments)} vs. período anterior`
      : `${data.online} reservados online` },
    { label: "Próximos atendimentos", value: data.upcoming_count },
    { label: "Horários livres hoje", value: data.free_slots ?? "—", note: data.slot_service ? `Base: ${data.slot_service}` : "Disponível para serviços publicados com profissional vinculado." },
    { label: "Concluídos", value: data.completed, note: percentage(data.completed, data.appointments) },
    { label: "Cancelados", value: data.cancelled, note: percentage(data.cancelled, data.appointments) },
    { label: "Não compareceram", value: data.no_show, note: percentage(data.no_show, data.appointments) },
    { label: "Aguardando aprovação", value: data.pending },
    { label: "Receita prevista", value: money(data.scheduled_cents), note: "Serviços de atendimentos agendados ou pendentes" },
    { label: "Faturamento registrado", value: money(data.confirmed_cents), note: "Pagamentos confirmados no período, incluindo a vitrine" },
    { label: "Clientes ativos", value: data.active_clients, note: "Total no cadastro do estabelecimento" },
  ] : [];

  return <section className="container section">
    <nav className="account-links" aria-label="Estabelecimento">
      <Link href="/painel">Meus estabelecimentos</Link>
      <Link href={`/painel/${shop}/agenda`}>Agenda</Link>
      <Link href={`/painel/${shop}/clientes`}>Clientes</Link>
    </nav>
    <header className="dashboard-header">
      <div><p className="eyebrow">{shopResult.data.name}</p><h1>Visão geral</h1></div>
      <div className="account-links dashboard-actions"><Link className="primary dashboard-action-agenda" href={`/painel/${shop}/agenda?novo=1#novo`}>
        <span aria-hidden="true">+</span> Novo agendamento
      </Link><Link className="primary dashboard-action-sale" href={checkout+"?aba=nova"}>Criar comanda</Link><Link className="primary dashboard-action-close" href={checkout+"?aba=fechamento"}>Fechamento</Link></div>
    </header>
    {comanda === "salva" && <p role="status">Comanda salva e mantida em aberto.</p>}
    <div className="checkout checkout-columns">
      <Link className="card checkout-shortcut checkout-shortcut-open" id="comandas-abertas" href={checkout}>
        <strong>Comandas abertas <span aria-hidden="true">→</span></strong>
        <span>{openSales ? `${openSales.count} · ${money(openSales.total)}` : "Consultar comandas"}</span>
      </Link>
      <Link className="card checkout-shortcut checkout-shortcut-card" href={checkout+"?aba=fechamento#pagamentos-cartao"}>
        <strong>Pagamentos em cartão hoje <span aria-hidden="true">→</span></strong>
        <span>{cardSales ? `Débito ${money(cardSales.debit)} · Crédito ${money(cardSales.credit)}` : "Consultar pagamentos"}</span>
      </Link>
      <section className="card checkout-shortcut checkout-shortcut-orders">
        <strong>Novos pedidos da vitrine</strong>
        <span>{newOrdersResult.error ? "Contagem indisponível" : `${newOrdersResult.count ?? 0} aguardando pagamento`}</span>
        <div><Link className="secondary" href={`/painel/${shop}/vitrine?aba=pendentes`}>Abrir pedidos da vitrine</Link></div>
      </section>
    </div>
    <details className="card panel-form" id="notificacoes" open={notificacoes === "1"}>
      <summary className={notifications?.unread ? "notice-unread" : undefined}>Notificações{notifications?.unread ? ` · ${notifications.unread} não lida(s)` : ""}</summary>
      {aviso === "falha" && <p role="alert">Não foi possível atualizar as notificações.</p>}
      {notificationResult.error || !notifications ? <p role="alert">Não foi possível carregar as notificações.</p>
        : <>
          <div className="account-links notification-tools">
          <nav className="account-links finance-tabs" aria-label="Guias de notificações">
            <Link className="secondary finance-tab" data-tone="rose" href={noticeLink("nao-lidas")} aria-current={!readNotices ? "page" : undefined}>Não lidas ({notifications.unread})</Link>
            <Link className="secondary finance-tab" data-tone="green" href={noticeLink("lidas")} aria-current={readNotices ? "page" : undefined}>Lidas</Link>
          </nav>
          {notifications.items.length > 0 && <details className="notification-clear"><summary className="secondary">Limpar todas</summary>
            <p>Remover todos os avisos lidos e não lidos da lista?</p>
            <form action={markBookingNotifications.bind(null, shop, notifications.as_of, selected.days, true)}>
              <SubmitButton>Confirmar limpeza</SubmitButton>
            </form>
          </details>}
          {notifications.unread > 0 && <form action={markBookingNotifications.bind(null, shop, notifications.as_of, selected.days, false)}>
            <SubmitButton tone="keep">Marcar todas como lidas</SubmitButton>
          </form>}
          </div>
          {visibleNotices.length ? <ul className="dashboard-notice-list">{visibleNotices.map((item) => <li key={item.id + "-" + (item.kind ?? "booking")}>
            <strong>{item.kind === "cancellation" ? "Agendamento cancelado pelo cliente" : item.kind === "showcase_order" ? "Novo pedido da vitrine" : "Novo agendamento"}{item.booking_read_at ? "" : " · Não lida"}</strong>
            <p>{item.client_name} · {item.service_name}{item.starts_at && ` · ${formatDay(item.starts_at)} às ${item.starts_at.slice(11, 16)}`}</p>
            <p>Recebida em {new Date(item.booking_created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
            {item.kind === "showcase_order" && <Link className="secondary" href={`/painel/${shop}/vitrine`}>Ver pedidos da vitrine</Link>}
            {item.starts_at && <Link className="secondary" href={`/painel/${shop}/agenda?dia=${item.starts_at.slice(0, 10)}${item.kind === "cancellation" ? "&visao=cancelados" : ""}#registro-${item.id}`}>Abrir na agenda</Link>}
          </li>)}</ul> : <p>Nenhuma notificação {readNotices ? "lida" : "não lida"}.</p>}
        </>}
    </details>
    <h2 className="panel-form">Indicadores</h2>
    <nav className="account-links" aria-label="Período dos indicadores">
      {periods.map(({ days, label }) => <Link key={days} className="secondary" aria-current={days === selected.days ? "page" : undefined}
        href={path + "?periodo=" + days}>{label}</Link>)}
    </nav>
    {report.error || !data ? <p role="alert">Não foi possível carregar os indicadores.</p> : <>
      <p className="panel-form">{data.first_day === data.today ? formatDay(data.today) : `${formatDay(data.first_day)} a ${formatDay(data.today)}`}</p>
      <dl className="cards">
        {indicators.map(({ label, value, note }, index) => <div key={label} className="card dashboard-metric">
          <dt>{label === "Cancelados" && <Link className="dashboard-card-link" aria-label="Ver agendamentos cancelados no período" href={`/painel/${shop}/agenda?visao=cancelados&dia=${data.today}&periodo=${selected.days}`} />}
            {label === "Agendamentos" && <Link className="dashboard-card-link" aria-label="Abrir agenda" href={`/painel/${shop}/agenda`} />}<span className="metric-mark" aria-hidden="true">{["▤", "↗", "◷", "✓", "×", "−", "⋯", "↗", "$", "◎"][index]}</span>{label}</dt>
          <dd>{value}</dd>
          {label === "Agendamentos" && <p>{data.appointments - data.cancelled} sem cancelamento · {data.cancelled} cancelados</p>}
          {note && <p>{note}</p>}
          {[2, 5, 6].includes(index) && <details className="dashboard-metric-list">
            <summary className="secondary">Ver {index === 2 ? "horários" : "atendimentos"}</summary>
            {index === 2 ? freeTimes?.error ? <p>Não foi possível carregar os horários.</p> : freeTimes?.data?.length
              ? <ul>{freeTimes.data.map(({ slot }: { slot: string }) => <li key={slot}>{slot.slice(11, 16)}</li>)}</ul>
              : <p>Nenhum horário livre para o serviço de referência.</p>
              : flagged?.error ? <p>Não foi possível carregar os atendimentos.</p> : (() => {
                const records = (flagged?.data ?? []).filter((entry) => entry.state === (index === 5 ? "no_show" : "pending"));
                return records.length ? <ul>{records.map((entry) => <li key={entry.id}>
                  <Link href={`/painel/${shop}/agenda?dia=${entry.starts_at.slice(0,10)}#registro-${entry.id}`}>
                    {formatDay(entry.starts_at)} às {entry.starts_at.slice(11,16)} · {entry.client_name} · {entry.service_name}
                  </Link>
                </li>)}</ul> : <p>Nenhum atendimento no período.</p>;
              })()}
          </details>}
          {label === "Faturamento registrado" && <p className="account-links">
            <Link className="secondary" href={`/painel/${shop}/comandas?periodo=${selected.days}`}>Ver comandas</Link>
            <Link className="secondary" href={`/painel/${shop}/vitrine`}>Ver pedidos</Link>
          </p>}
        </div>)}
      </dl>
      <DashboardCharts data={data} />
      <h2 id="proximos-atendimentos">Próximos atendimentos</h2>
      <CancellationFeedback state={cancelamento} />
      <Link href={`/painel/${shop}/agenda?visao=lista`}>Abrir agenda</Link>
      <AppointmentReminder shop={shop} appointments={upcoming.filter(({ state }) => state === "scheduled")} />
      {upcoming.length ? <ul className="cards">
        {[...upcoming].sort((a,b) => a.starts_at.localeCompare(b.starts_at)).map((item) => {
          const photo = httpsUrl(item.professional_photo);
          return <li key={item.id} className="card agenda-entry">
            <p className="agenda-entry-time">{formatDay(item.starts_at)} às {item.starts_at.slice(11,16)}</p>
            <h3>{item.service_name}</h3>
            <p className="agenda-provider">
              {photo && <img src={photo} alt="" width={36} height={36} loading="lazy" />}
              <span>{item.professional_name}</span>
            </p>
            <p className="booking-client"><ClientAvatar photo={avatars.get(item.id)} /><span>{item.client_name} · {item.state === "pending" ? "Aguardando aprovação" : "Agendado"}</span></p>
            <div className="agenda-entry-actions">
            <CancelAppointmentForm shop={shop} day={item.starts_at.slice(0,10)} entry={item.id} overview />
            <Link className="secondary agenda-card-button" href={`/painel/${shop}/agenda?dia=${item.starts_at.slice(0,10)}#registro-${item.id}`}><AgendaIcon name="calendar" />Abrir na agenda</Link>
            </div>
          </li>;
        })}
      </ul> : <p>Nenhum atendimento futuro na agenda.</p>}
      <h2 className="panel-form">Hoje em números</h2>
      <dl className="cards">
        {[
          ["Atendimentos marcados", data.marked_today], ["Concluídos", data.completed_today],
          ["Em atendimento agora", data.in_progress], ["Aguardando confirmação", data.pending_today],
        ].map(([label, value]) => <div key={label} className="card dashboard-metric"><dt>{label}</dt><dd>{value}</dd></div>)}
        <div className="card dashboard-metric"><dt>Pagamentos confirmados hoje</dt>
          <dd>{data.received_today === null ? <Link className="finance-unlock-metric" href={`/painel/${shop}/financeiro`}><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></svg>Desbloquear financeiro</Link> : money(data.received_today)}</dd>
        </div>
      </dl>
    </>}
  </section>;
}
