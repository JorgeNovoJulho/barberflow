import Link from "next/link";
import { bookingCurrency } from "../../../../lib/public-booking";
import { SubmitButton } from "../../../auth/submit";
import { addFinanceEntry, classifyExpense, settleFinanceEntry, reverseFinanceEntry } from "./actions";
import { expenseGuides, type ExpenseGuide, type FinanceGuide } from "./guias";

type Settlement = { id: string; amount_cents: number; recorded_at: string; reversed_at: string | null; reversal_reason: string | null };
type Entry = { id: string; direction: "in" | "out"; description: string; category: string; expense_type: ExpenseGuide | null; due_on: string; amount_cents: number; settled_cents: number; settlements: Settlement[] };
export type FinanceEntries = { payable: number; payable_by_type: Partial<Record<ExpenseGuide | "unclassified", number>>; receivable: number; unclassified: boolean; entries: Entry[] };

const money = (cents: number) => bookingCurrency.format(cents / 100);
const date = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function FinanceEntriesPanel({ shop, data, today, guide }: { shop: string; data: FinanceEntries; today: string; guide: FinanceGuide }) {
  const receiving = guide === "receivables";
  const unclassified = guide === "unclassified";
  const label = receiving ? "Cadastrar outro recebimento"
    : guide === "variable" ? "Cadastrar Despesas Variáveis"
    : guide === "reinvestment" ? "Cadastrar Reinvestimentos" : "Cadastrar Contas a Pagar";
  return <section id="lancamentos" className="panel-form">
    <h2>{receiving ? "Outros recebimentos" : "Contas a pagar"}</h2>
    {!receiving && <>
      <nav className="account-links" aria-label="Guias de contas a pagar">
        {Object.entries(expenseGuides).map(([key, title]) => <Link key={key}
          href={`?guia=${key}#lancamentos`} className="secondary expense-guide" data-expense={key} aria-current={guide === key ? "page" : undefined}>{title}</Link>)}
      </nav>
      {data.unclassified && <p><Link href="?guia=unclassified#lancamentos" aria-current={unclassified ? "page" : undefined}>Contas anteriores sem classificação</Link></p>}
    </>}
    {unclassified ? <p>Escolha a guia de cada conta anterior para organizar seu histórico.</p>
    : <details key={guide} className="card"><summary>{label}</summary>
      <form className="account-form" action={addFinanceEntry.bind(null, shop, crypto.randomUUID(), guide)}>
        <label>Descrição <input name="description" required maxLength={160} /></label>
        <label>Categoria <input name="category" required maxLength={80} /></label>
        <label>Vencimento <input name="due" type="date" defaultValue={today} required /></label>
        <label>Valor (R$) <input name="amount" inputMode="decimal" required /></label>
        <SubmitButton>{label}</SubmitButton>
      </form>
    </details>}
    <p>Até 100 lançamentos, com pendências primeiro.</p>
    {data.entries.length ? <ul className="cards">{data.entries.map((entry) => {
      const remaining = entry.amount_cents - entry.settled_cents;
      return <li key={entry.id} className="card">
        <h3>{entry.description}</h3>
        <p>{entry.direction === "out" ? "A pagar" : "A receber"} · {entry.category}</p>
        <p>Vencimento {entry.due_on.split("-").reverse().join("/")}{remaining > 0 && entry.due_on < today ? " · Vencido" : ""}</p>
        <dl className="order-totals">
          <div><dt>Valor</dt><dd>{money(entry.amount_cents)}</dd></div>
          <div><dt>Liquidado</dt><dd>{money(entry.settled_cents)}</dd></div>
          <div><dt>Em aberto</dt><dd>{money(remaining)}</dd></div>
        </dl>
        {remaining > 0 && <details><summary>{entry.direction === "out" ? "Registrar pagamento" : "Registrar recebimento"}</summary>
          <form className="account-form" action={settleFinanceEntry.bind(null, shop, entry.id, crypto.randomUUID(), guide)}>
            <label>Valor da baixa (R$) <input name="amount" inputMode="decimal" required defaultValue={(remaining / 100).toFixed(2).replace(".", ",")} /></label>
            <SubmitButton>Confirmar baixa</SubmitButton>
          </form>
        </details>}
        {!!entry.settlements.length && <details><summary>Histórico de baixas</summary>
          <ul>{entry.settlements.map((item) => <li key={item.id}>
            <p>{money(item.amount_cents)} · {date(item.recorded_at)}</p>
            {item.reversed_at ? <p>Estornada em {date(item.reversed_at)} · {item.reversal_reason}</p>
              : <details><summary>Estornar baixa</summary>
                <form className="account-form" action={reverseFinanceEntry.bind(null, shop, item.id, guide)}>
                  <label>Motivo <input name="reason" required maxLength={240} /></label>
                  <SubmitButton>Confirmar estorno</SubmitButton>
                </form>
              </details>}
          </li>)}</ul>
        </details>}
        {entry.direction === "out" && <details open={unclassified}>
          <summary>{unclassified ? "Classificar conta" : "Alterar guia"}</summary>
          <form className="account-form" action={classifyExpense.bind(null, shop, entry.id, guide)}>
            <label>Guia <select name="expense_type" required defaultValue={entry.expense_type ?? ""}>
              <option value="" disabled>Selecione</option>
              {Object.entries(expenseGuides).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
            </select></label>
            <SubmitButton>Salvar classificação</SubmitButton>
          </form>
        </details>}
      </li>;
    })}</ul> : <p>Nenhum lançamento nesta guia.</p>}
  </section>;
}
