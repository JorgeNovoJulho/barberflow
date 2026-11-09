import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { offsetDay, saoPauloToday, validDay } from "../../../../../lib/agenda";
import { isUuid } from "../../../../../lib/establishments";
import { bookingCurrency } from "../../../../../lib/public-booking";
import { supabaseServer } from "../../../../../lib/supabase";
import { PrintButton } from "./print-button";
import { CsvButton } from "./csv-button";

const periods = [
  ["dia", "Diário"], ["semana", "Semanal"], ["mes", "Mensal"],
  ["trimestre", "Trimestral"], ["semestre", "Semestral"], ["ano", "Anual"],
] as const;
const scales = [["day", "Dia"], ["week", "Semana"], ["month", "Mês"]] as const;
type Period = (typeof periods)[number][0];

function range(day: string, period: Period) {
  if (period === "dia") return [day, day];
  const date = new Date(day + "T00:00:00Z");
  if (period === "semana") {
    const monday = offsetDay(day, -((date.getUTCDay() + 6) % 7));
    return [monday, offsetDay(monday, 6)];
  }
  const months = { mes: 1, trimestre: 3, semestre: 6, ano: 12 }[period];
  const first = Math.floor(date.getUTCMonth() / months) * months;
  const year = date.getUTCFullYear();
  return [
    new Date(Date.UTC(year, first, 1)).toISOString().slice(0, 10),
    new Date(Date.UTC(year, first + months, 0)).toISOString().slice(0, 10),
  ];
}

const money = (cents: number) => bookingCurrency.format(cents / 100);
const dateLabel = (day: string) => day.split("-").reverse().join("/");
type Bucket = { day: string; income: number; expense: number };
type Movement = { day: string; description: string; amount: number };
type Report = { income: number; expense: number; opening: number; closing: number; planned_in: number; planned_out: number; series: Bucket[]; top_in: Movement[]; top_out: Movement[] };

function TopMovements({ title, items }: { title: string; items: Movement[] }) {
  return <section className="card">
    <h2>{title}</h2>
    {items.length ? <ol>{items.map((item, index) => <li key={index}>
      {dateLabel(item.day)} · {item.description} · <strong>{money(Math.abs(item.amount))}</strong>
    </li>)}</ol> : <p>Sem movimentações no período.</p>}
  </section>;
}

export default async function CashReport({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ periodo?: string; data?: string; agrupar?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const base = `/painel/${shop}/financeiro`;
  const path = base + "/relatorios";
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  const [business, access] = await Promise.all([
    supabase.from("barberflow_establishments").select("name").eq("id", shop).maybeSingle(),
    supabase.rpc("barberflow_finance_status", { shop }),
  ]);
  if (business.error || access.error) throw new Error("Não foi possível carregar o financeiro.");
  if (!business.data || access.data === "denied") notFound();
  if (access.data !== "unlocked") redirect(base);

  const filters = await searchParams;
  const period = periods.find(([id]) => id === filters.periodo) ?? periods[2];
  const day = typeof filters.data === "string" && validDay(filters.data) ? filters.data : saoPauloToday();
  const [first, last] = range(day, period[0]);
  const scale = scales.find(([id]) => id === filters.agrupar) ?? (period[0] === "dia" || period[0] === "semana" || period[0] === "mes" ? scales[0] : scales[2]);
  const { data, error } = await supabase.rpc("barberflow_cash_report", { shop, first_day: first, last_day: last, bucket_unit: scale[0] });
  const report = data as Report | null;
  if (!error && !report) redirect(base);
  const max = Math.max(1, ...(report?.series.flatMap((row) => [row.income, row.expense]) ?? []));
  const peak = (kind: "income" | "expense") => report?.series.reduce<Bucket | undefined>(
    (best, row) => row[kind] > (best?.[kind] ?? 0) ? row : best, undefined);
  const incomePeak = peak("income");
  const expensePeak = peak("expense");

  return <section className="container section finance-report">
    <nav className="account-links finance-print-hide" aria-label="Financeiro"><Link href={base}>Voltar ao financeiro</Link></nav>
    <p className="eyebrow">{business.data.name}</p><h1>Relatório de caixa</h1>
    <p>Fechamento {period[1].toLowerCase()} · {dateLabel(first)} a {dateLabel(last)}</p>
    <form className="account-form card panel-form finance-print-hide" action={path}>
      <div className="form-columns">
        <label>Fechamento <select name="periodo" defaultValue={period[0]}>
          {periods.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <label>Data de referência <input type="date" name="data" min="2000-01-01" max="2099-12-31" defaultValue={day} required /></label>
        <label>Agrupar gráfico por <select name="agrupar" defaultValue={scale[0]}>
          {scales.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
      </div>
      <button type="submit" className="secondary">Aplicar filtros</button>
    </form>
    {error || !report ? <p role="alert">Não foi possível carregar o relatório.</p> : <>
      <div className="account-links finance-print-hide">
        <PrintButton />
        <CsvButton filename={`barberflow-caixa-${first}-${last}.csv`} rows={[
          ["Período inicial", first, "Período final", last],
          ["Indicador", "Valor em R$"],
          ["Saldo de abertura", report.opening / 100],
          ["Entradas realizadas", report.income / 100],
          ["Saídas realizadas", report.expense / 100],
          ["Saldo de fechamento", report.closing / 100],
          ["Recebimentos avulsos previstos", report.planned_in / 100],
          ["Contas a pagar previstas", report.planned_out / 100],
          [],
          ["Início do agrupamento", "Entradas em R$", "Saídas em R$"],
          ...report.series.map((row) => [row.day, row.income / 100, row.expense / 100]),
          [],
          ["Maiores entradas e saídas", "Descrição", "Valor em R$"],
          ...[...report.top_in, ...report.top_out].map((row) => [row.day, row.description, row.amount / 100]),
        ]} />
      </div>
      <dl className="cards">
        {[
          ["Saldo de abertura", report.opening], ["Entradas realizadas", report.income], ["Saídas realizadas", report.expense],
          ["Resultado do período", report.income - report.expense], ["Saldo de fechamento", report.closing],
          ["Recebimentos avulsos previstos", report.planned_in], ["Contas a pagar previstas", report.planned_out],
        ].map(([label, value]) => <div className="card dashboard-metric" key={label}>
          <dt>{label}</dt><dd>{money(Number(value))}</dd>
        </div>)}
      </dl>
      <p>O saldo acumula os movimentos registrados no BARBERFLOW. Os valores previstos são lançamentos avulsos com vencimento no período. Estornos entram na data em que foram registrados.</p>
      <section className="card panel-form finance-chart">
        <h2>Movimentação por {scale[1].toLowerCase()}</h2>
        <p>Azul indica entradas. Laranja indica saídas.</p>
        {incomePeak && <p>Pico de entradas · {dateLabel(incomePeak.day)} · {money(incomePeak.income)}</p>}
        {expensePeak && <p>Pico de saídas · {dateLabel(expensePeak.day)} · {money(expensePeak.expense)}</p>}
        <ul>{report.series.map((row) => <li key={row.day}>
          <strong>{dateLabel(row.day)}</strong>
          <div className="finance-bar-row"><span>Entradas · {money(row.income)}</span><meter min={0} max={max} value={row.income} aria-label="Entradas" /></div>
          <div className="finance-bar-row finance-bar-out"><span>Saídas · {money(row.expense)}</span><meter min={0} max={max} value={row.expense} aria-label="Saídas" /></div>
        </li>)}</ul>
      </section>
      <div className="cards">
        <TopMovements title="Maiores entradas" items={report.top_in} />
        <TopMovements title="Maiores saídas" items={report.top_out} />
      </div>
    </>}
  </section>;
}
