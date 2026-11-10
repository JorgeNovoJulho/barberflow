import type { Closing, OpenSales } from "../caixa/model";
import Link from "next/link";
import { PurchaseUpdates } from "../../../minhas-compras/purchase-updates";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { markBookingNotifications } from "./notification-actions";

const periods = [{ days: 1, label: "Hoje" }, { days: 7, label: "7 dias" }, { days: 30, label: "30 dias" }];

type BookingNotifications = { unread: number; as_of: string; items: {
  id: string; client_name: string; service_name: string; starts_at: string; booking_created_at: string; booking_read_at: string | null;
}[] };

type Dashboard = {
  first_day: string; today: string; appointments: number; completed: number; cancelled: number; no_show: number;
  pending: number; online: number; scheduled_cents: number; confirmed_cents: number; active_clients: number;
  previous_appointments: number; upcoming_count: number; free_slots: number | null; slot_service: string | null;
  marked_today: number; completed_today: number; in_progress: number; pending_today: number; received_today: number | null;
  upcoming: { id: string; starts_at: string; client_name: string; service_name: string; professional_name: string; state: string }[];
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
  searchParams: Promise<{ periodo?: string; notificacoes?: string; aviso?: string; comanda?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const { periodo, notificacoes, aviso, comanda } = await searchParams;
  const selected = periods.find(({ days }) => String(days) === periodo) ?? periods[0];
  const path = `/painel/${shop}/resumo`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path + "?periodo=" + selected.days }));
  const [shopResult, report, notificationResult, openSalesResult, cardSalesResult] = await Promise.all([
    supabase.from("barberflow_establishments").select("name").eq("id", shop).maybeSingle(),
    supabase.rpc("barberflow_dashboard", { shop, period_days: selected.days }),
    supabase.rpc("barberflow_booking_notifications", { shop }),
    supabase.rpc("barberflow_counter_open", { shop_id:shop,page_number:0 }),
    supabase.rpc("barberflow_counter_report", { shop_id:shop,period:"dia",item_filter:"ambos",page_number:0 }),
  ]);
  if (shopResult.error) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!shopResult.data) notFound();
  const openSales = openSalesResult.data as OpenSales|null;
  const cardSales = cardSalesResult.data as Closing|null;
  const checkout = `/painel/${shop}/caixa`;
  const data = report.data as Dashboard | null;
  const notifications = notificationResult.data as BookingNotifications | null;
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
    <PurchaseUpdates interval={10_000} />
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
    </div>
    <details className="card panel-form" id="notificacoes" open={notificacoes === "1"}>
      <summary>Notificações{notifications?.unread ? ` · ${notifications.unread} não lida(s)` : ""}</summary>
      {aviso === "falha" && <p role="alert">Não foi possível marcar as notificações como lidas.</p>}
      {notificationResult.error || !notifications ? <p role="alert">Não foi possível carregar as notificações.</p>
        : notifications.items.length ? <>
          {notifications.unread > 0 && <form action={markBookingNotifications.bind(null, shop, notifications.as_of, selected.days)}>
            <SubmitButton>Marcar todas como lidas</SubmitButton>
          </form>}
          <ul>{notifications.items.map((item) => <li key={item.id}>
            <strong>Novo agendamento{item.booking_read_at ? "" : " · Não lida"}</strong>
            <p>{item.client_name} · {item.service_name} · {formatDay(item.starts_at)} às {item.starts_at.slice(11, 16)}</p>
            <p>Recebida em {new Date(item.booking_created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
            <Link href={`/painel/${shop}/agenda?dia=${item.starts_at.slice(0, 10)}#registro-${item.id}`}>Abrir na agenda</Link>
          </li>)}</ul>
        </> : <p>Nenhuma notificação de reserva online.</p>}
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
          <dt><span className="metric-mark" aria-hidden="true">{["▤", "↗", "◷", "✓", "×", "−", "⋯", "↗", "$", "◎"][index]}</span>{label}</dt>
          <dd>{value}</dd>{note && <p>{note}</p>}
          {label === "Faturamento registrado" && <p className="account-links">
            <Link className="secondary" href={`/painel/${shop}/comandas?periodo=${selected.days}`}>Ver comandas</Link>
            <Link className="secondary" href={`/painel/${shop}/vitrine`}>Ver pedidos</Link>
          </p>}
        </div>)}
      </dl>
      <DashboardCharts data={data} />
      <h2 className="panel-form">Próximos atendimentos</h2>
      <Link href={`/painel/${shop}/agenda?visao=lista`}>Abrir agenda</Link>
      {data.upcoming.length ? <ul className="cards">{data.upcoming.map((item) => <li key={item.id} className="card">
        <h3>{item.service_name}</h3>
        <p>{formatDay(item.starts_at)} às {item.starts_at.slice(11, 16)} · {item.professional_name}</p>
        <p>{item.client_name} · {item.state === "pending" ? "Aguardando aprovação" : "Agendado"}</p>
        <Link href={`/painel/${shop}/agenda?dia=${item.starts_at.slice(0, 10)}#registro-${item.id}`}>Abrir atendimento na agenda</Link>
      </li>)}</ul> : <p>Nenhum atendimento futuro na agenda.</p>}
      <h2 className="panel-form">Hoje em números</h2>
      <dl className="cards">
        {[
          ["Atendimentos marcados", data.marked_today], ["Concluídos", data.completed_today],
          ["Em atendimento agora", data.in_progress], ["Aguardando confirmação", data.pending_today],
        ].map(([label, value]) => <div key={label} className="card dashboard-metric"><dt>{label}</dt><dd>{value}</dd></div>)}
        <div className="card dashboard-metric"><dt>Pagamentos confirmados hoje</dt>
          <dd>{data.received_today === null ? <Link href={`/painel/${shop}/financeiro`}>Desbloquear financeiro</Link> : money(data.received_today)}</dd>
        </div>
      </dl>
    </>}
  </section>;
}
