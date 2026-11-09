import Link from "next/link";
import { redirect } from "next/navigation";
import { saoPauloToday, validDay } from "../../../../../lib/agenda";
import { bookingCurrency } from "../../../../../lib/public-booking";
import { reportAccess } from "../report-access";
import { CsvButton } from "../relatorios/csv-button";

type Ranking = { name: string; quantity: number; cents: number };
type Report = {
  quantity: number; cents: number; ticket_cents: number;
  days: { day: string; cents: number }[];
  professionals: (Ranking & { professional_id: string; commission_cents: number; untracked: number; product_commission_cents: number; untracked_products: number })[];
  services: (Ranking & { service_id: string })[];
  products: (Ranking & { product_id: string })[];
  hours: { weekday: number; hour: number; quantity: number }[];
};

const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const money = (cents: number) => bookingCurrency.format(cents / 100);
const dateLabel = (day: string) => day.split("-").reverse().join("/");
const hourLabel = (hour: number) => String(hour).padStart(2, "0") + "h";

export async function PerformanceReport({ params, searchParams, delegated = false }: {
  params: Promise<{ establishmentId: string }>;
  delegated?: boolean;
  searchParams: Promise<{ inicio?: string; fim?: string; profissional?: string }>;
}) {
  const { establishmentId: shop } = await params;
  const { supabase, base, path, name } = await reportAccess(shop, delegated, "desempenho");

  const filters = await searchParams;
  const today = saoPauloToday();
  const first = typeof filters.inicio === "string" && validDay(filters.inicio) ? filters.inicio : today.slice(0, 7) + "-01";
  const last = typeof filters.fim === "string" && validDay(filters.fim) ? filters.fim : today;
  const span = (Date.parse(last) - Date.parse(first)) / 86400000;
  const validPeriod = span >= 0 && span <= 365;
  const team = delegated ? await supabase.rpc("barberflow_team_report_professionals", { shop })
    : await supabase.from("barberflow_professionals").select("id,name,active").eq("establishment_id", shop).order("name");
  if (team.error) throw new Error("Não foi possível carregar a equipe.");
  const people = (team.data ?? []) as { id: string; name: string; active: boolean }[];
  const professional = people.find(({ id }) => id === filters.profissional);
  const result = validPeriod ? await supabase.rpc("barberflow_performance_report", {
    shop, first_day: first, last_day: last, professional: professional?.id ?? null,
  }) : null;
  if (result && !result.error && !result.data) redirect(base);
  const report = result?.data as Report | undefined;
  const max = Math.max(1, ...(report?.days.map(({ cents }) => cents) ?? []));

  return <section className="container section">
    <nav className="account-links" aria-label="Financeiro">
      <Link href={base}>Voltar ao financeiro</Link>
      <Link href={base + "/relatorios"}>Relatório de caixa</Link>
    </nav>
    <p className="eyebrow">{name}</p><h1>Desempenho</h1>
    <form className="account-form card panel-form" action={path}>
      <div className="form-columns">
        <label>Data inicial <input type="date" name="inicio" min="2000-01-01" max="2099-12-31" defaultValue={first} required /></label>
        <label>Data final <input type="date" name="fim" min="2000-01-01" max="2099-12-31" defaultValue={last} required /></label>
        <label>Profissional <select name="profissional" defaultValue={professional?.id ?? ""}>
          <option value="">Todos</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.active ? "" : " (inativo)"}</option>)}
        </select></label>
      </div>
      <button type="submit" className="secondary">Aplicar filtros</button>
    </form>
    {!validPeriod && <p role="alert">Selecione um período de até 366 dias, com a data final igual ou posterior à inicial.</p>}
    {result?.error && <p role="alert">Não foi possível carregar os indicadores de desempenho.</p>}
    {report && <>
      <p>{dateLabel(first)} a {dateLabel(last)} · {professional?.name ?? "Todos os profissionais"}</p>
      <CsvButton filename={`barberflow-desempenho-${first}-${last}.csv`} rows={[
        ["Data inicial", first, "Data final", last, "Profissional", professional?.name ?? "Todos"],
        ["Comandas fechadas", report.quantity, "Faturamento em R$", report.cents / 100, "Ticket médio em R$", report.ticket_cents / 100],
        [], ["Data", "Faturamento em R$"], ...report.days.map((row) => [row.day, row.cents / 100]),
        [], ["Profissional", "Comandas", "Faturamento em R$"], ...report.professionals.map((row) => [row.name, row.quantity, row.cents / 100]),
        [], ["Profissional", "Comissão de serviços em R$", "Comissão de produtos em R$", "Total registrado em R$", "Comandas sem taxa de serviços", "Vendas sem taxa de produtos"],
        ...report.professionals.map((row) => [row.name, row.commission_cents / 100, row.product_commission_cents / 100,
          (row.commission_cents + row.product_commission_cents) / 100, row.untracked, row.untracked_products]),
        [], ["Serviço", "Vendas", "Valor dos serviços em R$"], ...report.services.map((row) => [row.name, row.quantity, row.cents / 100]),
        [], ["Produto", "Unidades vendidas", "Valor dos produtos em R$"], ...report.products.map((row) => [row.name, row.quantity, row.cents / 100]),
        [], ["Dia da semana", "Hora", "Atendimentos concluídos"], ...report.hours.map((row) => [weekdays[row.weekday], hourLabel(row.hour), row.quantity]),
      ]} />
      <dl className="cards">
        <div className="card dashboard-metric"><dt>Faturamento</dt><dd>{money(report.cents)}</dd></div>
        <div className="card dashboard-metric"><dt>Ticket médio</dt><dd>{money(report.ticket_cents)}</dd></div>
        <div className="card dashboard-metric"><dt>Comandas fechadas</dt><dd>{report.quantity}</dd></div>
      </dl>
      <p>O faturamento usa o valor das comandas fechadas no período. Os horários usam a data e a hora dos atendimentos concluídos.</p>
      <section className="card panel-form finance-chart">
        <h2>Faturamento por dia</h2>
        {report.days.length ? <ul>{report.days.map((row) => <li key={row.day} className="finance-bar-row">
          <span>{dateLabel(row.day)} · {money(row.cents)}</span>
          <meter min={0} max={max} value={row.cents} aria-label={`Faturamento em ${dateLabel(row.day)}`} />
        </li>)}</ul> : <p>Sem comandas fechadas neste período.</p>}
      </section>
      <div className="cards">
        <section className="card"><h2>Comissões por profissional</h2>
          <p>Cada comissão usa o subtotal de serviços ou produtos e o percentual registrado no fechamento da comanda.</p>
          {report.professionals.length ? <ul>{report.professionals.map((row) => <li key={row.professional_id}>
            <strong>{row.name}</strong> · Total registrado {money(row.commission_cents + row.product_commission_cents)}
            <p>Serviços {money(row.commission_cents)} · Produtos {money(row.product_commission_cents)}</p>
            {row.untracked > 0 && <p>{row.untracked} comanda(s) sem percentual de serviços registrado.</p>}
            {row.untracked_products > 0 && <p>{row.untracked_products} comanda(s) com vendas de produtos sem percentual registrado.</p>}
          </li>)}</ul> : <p>Sem comandas no período.</p>}
        </section>
        <section className="card"><h2>Faturamento por profissional</h2>
          {report.professionals.length ? <ol>{report.professionals.map((row) => <li key={row.professional_id}>{row.name} · {row.quantity} comanda(s) · {money(row.cents)}</li>)}</ol> : <p>Sem comandas no período.</p>}
        </section>
        <section className="card"><h2>Serviços mais vendidos</h2>
          {report.services.length ? <ol>{report.services.map((row) => <li key={row.service_id + ":" + row.name}>{row.name} · {row.quantity} venda(s) · {money(row.cents)}</li>)}</ol> : <p>Sem serviços vendidos no período.</p>}
        </section>
        <section className="card"><h2>Produtos mais vendidos</h2>
          {report.products.length ? <ol>{report.products.map((row) => <li key={row.product_id}>{row.name} · {row.quantity} un. · {money(row.cents)}</li>)}</ol> : <p>Sem produtos vendidos no período.</p>}
        </section>
        <section className="card"><h2>Dias e horários mais movimentados</h2>
          {report.hours.length ? <ol>{report.hours.map((row) => <li key={row.weekday + ":" + row.hour}>{weekdays[row.weekday]} às {hourLabel(row.hour)} · {row.quantity} atendimento(s)</li>)}</ol> : <p>Sem atendimentos concluídos no período.</p>}
        </section>
      </div>
    </>}
  </section>;
}
