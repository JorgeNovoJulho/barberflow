import { bookingCurrency } from "../../../../lib/public-booking";

type Sale = { id: string; name: string; quantity: number; cents: number };
export type MonthlyCosts = { today: string; days: number; expenses: number; products: (Sale & { replacement: number | null })[]; services: Sale[] };
export type CommissionReport = {
  first: string; last: string;
  professionals: { id: string; name: string }[];
  orders: { professional_id: string | null; service_commission: number | null; product_commission: number | null; receipt_id: string | null }[];
};
export const commissionPeriods = { dia: "Dia", semana: "Semana", quinzena: "Quinzena", mes: "Mês" };
export type CommissionPeriod = keyof typeof commissionPeriods;
const money = (cents: number) => bookingCurrency.format(cents / 100);
const date = (day: string) => day.split("-").reverse().join("/");
const commission = (order: CommissionReport["orders"][number]) => (order.service_commission ?? 0) + (order.product_commission ?? 0);

export function FinanceCostCards({ costs, monthly, filtered, period, reference, professional, guide }: {
  costs: MonthlyCosts; monthly: CommissionReport | null; filtered: CommissionReport | null;
  period: CommissionPeriod; reference: string; professional: string; guide: string;
}) {
  const professionals = filtered?.professionals ?? monthly?.professionals ?? [];
  const selected = professionals.find(({ id }) => id === professional);
  const pending = monthly?.orders.filter(({ receipt_id }) => !receipt_id).reduce((sum, order) => sum + commission(order), 0);
  const accrued = monthly?.orders.reduce((sum, order) => sum + commission(order), 0);
  const replacement = costs.products.reduce((sum, product) => sum + (product.replacement ?? 0), 0);
  const missingCost = costs.products.some((product) => product.replacement === null);
  const filteredTotals = new Map<string, number>();
  for (const order of filtered?.orders ?? []) {
    if (!order.professional_id || order.receipt_id) continue;
    filteredTotals.set(order.professional_id, (filteredTotals.get(order.professional_id) ?? 0) + commission(order));
  }
  const rows = (selected ? [selected] : professionals).filter(({ id }) => (filteredTotals.get(id) ?? 0) > 0);
  const daily = accrued === undefined ? null : Math.ceil((costs.expenses + accrued + replacement) / costs.days);
  return <>
    <div className="card dashboard-metric" id="comissoes">
      <dt>Comissões a pagar</dt><dd>{pending === undefined ? "—" : money(pending)}</dd>
      <dd className="finance-cost-detail"><details open={Boolean(reference)}>
        <summary>Filtrar comissões</summary>
        <form className="account-form" action="#comissoes">
          <input type="hidden" name="guia" value={guide} />
          <label>Profissional <select name="profissionalComissao" defaultValue={selected?.id ?? ""}>
            <option value="">Todos</option>
            {professionals.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <label>Período <select name="periodoComissao" defaultValue={period}>
            {Object.entries(commissionPeriods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label>Data de referência <input type="date" name="dataComissao" defaultValue={reference || costs.today} required /></label>
          <button className="secondary" type="submit">Aplicar filtros</button>
        </form>
        {filtered ? <>
          <p>{date(filtered.first)} a {date(filtered.last)}</p>
          <p>Total em aberto no filtro <strong>{money(rows.reduce((sum, { id }) => sum + (filteredTotals.get(id) ?? 0), 0))}</strong></p>
          {rows.length ? <ul>{rows.map(({ id, name }) => <li key={id}>{name} · {money(filteredTotals.get(id) ?? 0)}</li>)}</ul> : <p>Sem comissões em aberto no período.</p>}
        </> : <p role="status">Não foi possível consultar as comissões.</p>}
      </details></dd>
    </div>
    <div className="card dashboard-metric">
      <dt>Custo diário</dt><dd>{daily === null ? "—" : money(daily)}</dd>
      <dd className="finance-cost-detail">{date(costs.today)} · Despesas, comissões geradas e reposição divididas por {costs.days} dias.</dd>
      {missingCost && <dd className="finance-cost-detail">Estimativa parcial. Há produtos vendidos sem custo cadastrado.</dd>}
    </div>
    <div className="card dashboard-metric">
      <dt>Custo de reposição de produtos</dt><dd>{money(replacement)}</dd>
      <dd className="finance-cost-detail"><details>
        <summary>Ver produtos vendidos neste mês</summary>
        <p>Cálculo com o custo unitário atual do estoque.</p>
        {costs.products.length ? <ul>{costs.products.map((product) => <li key={product.id}>
          {product.name} · {product.quantity} un. · {product.replacement === null ? "Custo não cadastrado" : money(product.replacement)}
        </li>)}</ul> : <p>Nenhum produto vendido no período.</p>}
      </details></dd>
    </div>
  </>;
}
