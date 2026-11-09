import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { closedAtLabel, orderPage, orderPeriod, orderPeriods } from "./filters";

type ClosedOrders = { count: number; items: {
  appointment_id: string; closed_at: string; total_cents: number;
  client_name: string; service_name: string; professional_name: string;
}[] };

export default async function ClosedOrdersPage({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ periodo?: string; pagina?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const { periodo, pagina } = await searchParams;
  const period = orderPeriod(periodo);
  const page = orderPage(pagina);
  const base = `/painel/${shop}`;
  const path = base + "/comandas";
  const filters = (nextPage: number) => new URLSearchParams({ periodo: period, pagina: String(nextPage) });
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path + "?" + filters(page) }));
  const [business, result] = await Promise.all([
    supabase.from("barberflow_establishments").select("name").eq("id", shop).maybeSingle(),
    supabase.rpc("barberflow_closed_orders", { shop, period_days: period === "todas" ? 0 : Number(period), page_number: page }),
  ]);
  if (business.error) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!business.data) notFound();
  const orders = result.data as ClosedOrders | null;
  const lastPage = Math.max(1, Math.ceil((orders?.count ?? 0) / 25));
  if (!result.error && page > lastPage) redirect(path + "?" + filters(lastPage));

  return <section className="container section">
    <Link href={base + "/resumo" + (period === "todas" ? "" : "?periodo=" + period)}>Voltar à visão geral</Link>
    <header className="operational-heading">
      <p className="eyebrow">{business.data.name}</p><h1>Comandas fechadas</h1>
      <p>Abra uma comanda para conferir o atendimento, os produtos e o total registrado.</p>
    </header>
    <nav className="account-links" aria-label="Período das comandas">
      {orderPeriods.map(({ id, label }) => <Link key={id} className="secondary" aria-current={id === period ? "page" : undefined}
        href={path + "?periodo=" + id}>{label}</Link>)}
    </nav>
    {result.error || !orders ? <p role="alert">Não foi possível consultar as comandas.</p> : orders.items.length ? <>
      <p className="panel-form">{orders.count.toLocaleString("pt-BR")} {orders.count === 1 ? "comanda" : "comandas"} · Página {page} de {lastPage}</p>
      <ul className="cards">{orders.items.map((order) => <li className="card" key={order.appointment_id}>
        <p className="eyebrow">Fechada em {closedAtLabel(order.closed_at)}</p>
        <h2>{order.client_name}</h2>
        <p>{order.service_name} · {order.professional_name}</p>
        <p><strong>{bookingCurrency.format(order.total_cents / 100)}</strong></p>
        <Link className="secondary" href={`${base}/comanda/${order.appointment_id}?${filters(page)}`}>Ver comanda de {order.client_name}</Link>
      </li>)}</ul>
      {lastPage > 1 && <nav className="account-links" aria-label="Paginação das comandas">
        {page > 1 && <Link className="secondary" href={path + "?" + filters(page - 1)}>Página anterior</Link>}
        {page < lastPage && <Link className="secondary" href={path + "?" + filters(page + 1)}>Próxima página</Link>}
      </nav>}
    </> : <p className="card panel-form">Nenhuma comanda fechada neste período.</p>}
  </section>;
}
