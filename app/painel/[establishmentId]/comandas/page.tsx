import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { closedAtLabel, orderPage, orderPeriod, orderPeriods, orderTab } from "./filters";

type OrderSummary = {
  appointment_id: string; total_cents: number;
  client_name: string; service_name: string; professional_name: string;
} & ({ closed_at: string } | { starts_at: string; stage: keyof typeof stages; product_units: number });
type Orders = { count: number; items: OrderSummary[] };
const stages = {
  awaiting_close: "Concluído · Aguardando fechamento",
  current: "No horário do atendimento",
  awaiting_status: "Horário encerrado · Aguardando atualização",
  scheduled: "Agendado",
};

export default async function OrdersPage({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ periodo?: string; pagina?: string; aba?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const { periodo, pagina, aba } = await searchParams;
  const tab = orderTab(aba);
  const open = tab === "abertas";
  const period = orderPeriod(periodo);
  const page = orderPage(pagina);
  const base = `/painel/${shop}`;
  const path = base + "/comandas";
  const filters = (nextPage: number) => new URLSearchParams({ aba: tab, periodo: period, pagina: String(nextPage) });
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path + "?" + filters(page) }));
  const [business, result] = await Promise.all([
    supabase.from("barberflow_establishments").select("name").eq("id", shop).maybeSingle(),
    supabase.rpc(open ? "barberflow_open_orders" : "barberflow_closed_orders", {
      shop, period_days: period === "todas" ? 0 : Number(period), page_number: page,
    }),
  ]);
  if (business.error) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!business.data) notFound();
  const orders = result.data as Orders | null;
  const lastPage = Math.max(1, Math.ceil((orders?.count ?? 0) / 25));
  if (!result.error && page > lastPage) redirect(path + "?" + filters(lastPage));

  return <section className="container section">
    <Link href={base + "/resumo" + (period === "todas" ? "" : "?periodo=" + period)}>Voltar à visão geral</Link>
    <header className="operational-heading">
      <p className="eyebrow">{business.data.name}</p><h1>{open ? "Comandas em aberto" : "Comandas fechadas"}</h1>
      <p>{open ? "Acompanhe o atendimento, os itens lançados e o total parcial." : "Abra uma comanda para conferir o atendimento, os produtos e o total registrado."}</p>
    </header>
    <nav className="account-links" aria-label="Situação das comandas">
      <Link className="secondary" aria-current={!open ? "page" : undefined} href={path + "?aba=fechadas&periodo=" + period}>Fechadas</Link>
      <Link className="secondary" aria-current={open ? "page" : undefined} href={path + "?aba=abertas&periodo=" + period}>Em aberto</Link>
    </nav>
    <nav className="account-links" aria-label="Período das comandas">
      {orderPeriods.map(({ id, label }) => <Link key={id} className="secondary" aria-current={id === period ? "page" : undefined}
        href={path + "?aba=" + tab + "&periodo=" + id}>{label}</Link>)}
    </nav>
    {result.error || !orders ? <p role="alert">Não foi possível consultar as comandas.</p> : orders.items.length ? <>
      <p className="panel-form">{orders.count.toLocaleString("pt-BR")} {orders.count === 1 ? "comanda" : "comandas"} · Página {page} de {lastPage}</p>
      <ul className="cards">{orders.items.map((order) => <li className="card" key={order.appointment_id}>
        {"closed_at" in order ? <p className="eyebrow">Fechada em {closedAtLabel(order.closed_at)}</p> : <>
          <p className="eyebrow">{stages[order.stage]}</p>
          <p>{order.starts_at.slice(0, 10).split("-").reverse().join("/")} às {order.starts_at.slice(11, 16)} · {order.product_units} un. de produtos</p>
        </>}
        <h2>{order.client_name}</h2>
        <p>{order.service_name} · {order.professional_name}</p>
        <p>{open && "Total parcial: "}<strong>{bookingCurrency.format(order.total_cents / 100)}</strong></p>
        <Link className="secondary" href={`${base}/comanda/${order.appointment_id}?${filters(page)}`}>Ver comanda de {order.client_name}</Link>
      </li>)}</ul>
      {lastPage > 1 && <nav className="account-links" aria-label="Paginação das comandas">
        {page > 1 && <Link className="secondary" href={path + "?" + filters(page - 1)}>Página anterior</Link>}
        {page < lastPage && <Link className="secondary" href={path + "?" + filters(page + 1)}>Próxima página</Link>}
      </nav>}
    </> : <p className="card panel-form">Nenhuma comanda {open ? "em aberto" : "fechada"} neste período.</p>}
  </section>;
}
