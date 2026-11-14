import { revalidatePath } from "next/cache";
import Link from "next/link";
import { offsetDay } from "../../../../lib/agenda";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";

const periods = [
  ["dia", "Dia", "purple"], ["semana", "Semanal", "blue"],
  ["quinzena", "Quinzenal", "teal"], ["mes", "Mensal", "amber"], ["ano", "Anual", "rose"],
] as const;
type Day = { day: string; pending: number; settled: number };
const money = (cents: number) => bookingCurrency.format(cents / 100);
const total = (day: Day) => day.pending + day.settled;

export async function MyCommissions({ shop, today, view, year, base }: {
  shop: string; today: string; view?: string; year?: string; base: string;
}) {
  const period = periods.some(([key]) => key === view) ? view : "dia";
  const currentYear = Number(today.slice(0, 4));
  const selectedYear = period === "ano" && year && /^\d{4}$/.test(year) &&
    Number(year) >= 2000 && Number(year) <= currentYear ? Number(year) : currentYear;
  const monday = offsetDay(today, -((new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7));
  const firstMonth = today.slice(0, 7) + "-01";
  const nextMonth = offsetDay(firstMonth, 32).slice(0, 7) + "-01";
  const middle = offsetDay(firstMonth, 15);
  const start = period === "ano" ? selectedYear + "-01-01" : period === "semana" ? monday :
    period === "quinzena" && today >= middle ? middle : period === "dia" ? today : firstMonth;
  const end = period === "ano" ? (selectedYear + 1) + "-01-01" : period === "semana" ? offsetDay(monday, 7) :
    period === "quinzena" && today < middle ? middle : period === "dia" ? offsetDay(today, 1) : nextMonth;
  const client = await supabaseServer();
  const results = await Promise.all([...new Set([Number(start.slice(0, 4)), Number(offsetDay(end, -1).slice(0, 4))])]
    .map(reference_year => client?.rpc("barberflow_professional_commission_days", { shop_id: shop, reference_year })));
  const receipts = await client?.rpc("barberflow_my_commission_receipts", { shop_id: shop });
  async function acknowledge(receipt: string) {
    "use server";
    const session = await supabaseServer();
    const result = await session?.rpc("barberflow_acknowledge_commission", { shop_id: shop, receipt });
    if (result?.data !== true) throw new Error("Não foi possível confirmar o recebimento.");
    revalidatePath(base.split("?")[0]);
  }
  const failed = results.some(result => !result || result.error);
  const rows = results.flatMap(result => (result?.data ?? []) as Day[]).filter(row => row.day >= start && row.day < end);
  const url = (key: string, targetYear = selectedYear) => base + "&comissoes=" + key + "&ano=" + targetYear + "#minhas-comissoes";
  const months = Array.from({ length: 12 }, (_, index) => {
    const prefix = selectedYear + "-" + String(index + 1).padStart(2, "0");
    const days = rows.filter(row => row.day.startsWith(prefix));
    const amount = days.reduce((sum, day) => sum + total(day), 0);
    const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(prefix + "-01T12:00:00Z"));
    return { prefix, label, days, amount };
  });
  const withSales = months.filter(month => month.amount > 0);
  const highest = Math.max(1, ...withSales.map(month => month.amount));
  const lowest = Math.min(...withSales.map(month => month.amount));

  return <section className="card" id="minhas-comissoes" aria-labelledby="commission-title">
    <h2 id="commission-title">Minhas Comissões</h2>
    <nav className="account-links" aria-label="Período das comissões">
      {periods.map(([key, label, tone]) => <Link key={key} href={url(key)} className="secondary finance-tab"
        data-tone={tone} aria-current={period === key ? "page" : undefined}>{label}</Link>)}
    </nav>
    {period === "ano" && <nav className="account-links" aria-label="Ano das comissões">
      {selectedYear > 2000 && <Link className="secondary" href={url("ano", selectedYear - 1)}>Ano anterior</Link>}
      <strong>{selectedYear}</strong>
      {selectedYear < currentYear && <Link className="secondary" href={url("ano", selectedYear + 1)}>Ano seguinte</Link>}
    </nav>}
    {failed ? <p role="alert">Não foi possível consultar suas comissões.</p> : <>
      <div className="professional-chart-grid">
        <div className="professional-chart"><h3>A receber</h3><strong>{money(rows.reduce((sum, row) => sum + row.pending, 0))}</strong></div>
        <div className="professional-chart"><h3>Quitadas pela loja</h3><strong>{money(rows.reduce((sum, row) => sum + row.settled, 0))}</strong></div>
      </div>
      {!rows.length && <p>Sem comissões no período.</p>}
      {period === "ano" && months.map(month => <details key={month.prefix}>
        <summary>{month.label} · {money(month.amount)}
          {month.amount > 0 && month.amount === highest && " · Maior ganho"}
          {month.amount > 0 && month.amount === lowest && " · Menor ganho"}
        </summary>
        <span className="professional-chart-track" aria-hidden="true"><span style={{
          width: (month.amount / highest * 100) + "%", backgroundColor: "#6341b9",
        }} /></span>
        <DailyChart rows={month.days} />
      </details>)}
      {period !== "ano" && !!rows.length && <DailyChart rows={rows} />}
    </>}
    <h3>Confirmação de recebimentos</h3>
    {receipts?.error ? <p role="alert">Não foi possível consultar os repasses.</p>
      : receipts?.data?.length ? <ul className="professional-chart-bars">
        {receipts.data.map((receipt: {id: string; issued_at: string; amount: number; acknowledged_at: string | null}) => <li key={receipt.id}>
          <div><time dateTime={receipt.issued_at}>{new Date(receipt.issued_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</time>
            <strong>{money(receipt.amount)}</strong></div>
          {receipt.acknowledged_at ? <p>Recebimento confirmado</p> :
            <form className="account-links" action={acknowledge.bind(null, receipt.id)}>
              <label><input type="checkbox" required /> Conferi o pagamento e recebi o valor.</label>
              <button className="primary action-keep">Confirmar recebimento</button>
            </form>}
        </li>)}
      </ul> : <p>Nenhum repasse registrado pela loja.</p>}
  </section>;
}

function DailyChart({ rows }: { rows: Day[] }) {
  const values = rows.map(total);
  const highest = Math.max(1, ...values);
  const lowest = Math.min(...values);
  if (!rows.length) return <p>Sem movimentação.</p>;
  return <ul className="professional-chart-bars">{rows.map(row => <li key={row.day}>
    <div><time dateTime={row.day}>{row.day.split("-").reverse().join("/")}</time><strong>{money(total(row))}</strong></div>
    <small>A receber {money(row.pending)} · Quitadas {money(row.settled)}
      {total(row) === highest && " · Maior ganho"}{total(row) === lowest && " · Menor ganho"}
    </small>
    <span className="professional-chart-track" aria-hidden="true"><span style={{
      width: (total(row) / highest * 100) + "%", backgroundColor: "#087e66",
    }} /></span>
  </li>)}</ul>;
}
