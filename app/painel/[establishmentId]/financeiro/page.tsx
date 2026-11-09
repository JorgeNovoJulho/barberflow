import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { lockFinance, recordPayment, reversePayment, unlockFinance } from "./actions";
import { FinanceEntriesPanel, type FinanceEntries } from "./lancamentos";
import { saoPauloToday } from "../../../../lib/agenda";
import { financeGuide } from "./guias";

const methods = { pix: "Pix", cash: "Dinheiro", card: "Cartão", transfer: "Transferência", other: "Outro" };
const feedback: Record<string, string> = {
  desbloqueado: "Área financeira desbloqueada por 15 minutos.",
  fechado: "Área financeira bloqueada.",
  bloqueado: "Muitas tentativas. Aguarde até 15 minutos para tentar de novo.",
  "senha-invalida": "Confira a senha financeira e a confirmação, quando solicitada.",
  dados: "Confira os dados informados.",
  falha: "Não foi possível concluir a operação.",
  recebido: "Recebimento registrado.",
  saldo: "Confira o valor em aberto e se a área financeira está desbloqueada.",
  estornado: "Estorno registrado. O valor em aberto foi atualizado.",
  lancado: "Lançamento cadastrado.",
  baixado: "Baixa registrada no caixa.",
  classificado: "Classificação da conta atualizada.",
};

type Payment = { id: string; amount_cents: number; method: keyof typeof methods; recorded_at: string; reversed_at: string | null; reversal_reason: string | null };
type Bill = { appointment_id: string; client_name: string; closed_at: string; total_cents: number; received_cents: number; payments: Payment[] };
type Ledger = { open_cents: number; cash_cents: number; bills: Bill[] };

const money = (cents: number) => bookingCurrency.format(cents / 100);
const date = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function Finance({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ estado?: string; guia?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: `/painel/${shop}/financeiro` }));
  const [business, access] = await Promise.all([
    supabase.from("barberflow_establishments").select("name").eq("id", shop).maybeSingle(),
    supabase.rpc("barberflow_finance_status", { shop }),
  ]);
  if (business.error || access.error) throw new Error("Não foi possível carregar o financeiro.");
  if (!business.data || access.data === "denied") notFound();

  const { estado, guia } = await searchParams;
  const guide = financeGuide(guia);
  const setup = access.data === "setup";
  const [result, entriesResult, controls] = access.data === "unlocked" ? await Promise.all([
    supabase.rpc("barberflow_receivables", { shop }), supabase.rpc("barberflow_finance_entries", { shop, expense_view: guide }),
    supabase.rpc("barberflow_card_controls", { shop }),
  ]) : [null, null, null];
  const ledger = result?.data as Ledger | null;
  const entries = entriesResult?.data as FinanceEntries | null;
  const cardControls = (controls?.data ?? []) as { receipt_id: string; payment_id: string | null }[];
  const openCardCharges = new Set(cardControls.filter((row) => !row.payment_id).map((row) => row.receipt_id));
  const integratedPayments = new Set(cardControls.map((row) => row.payment_id));
  return <section className="container section">
    <nav className="account-links" aria-label="Estabelecimento">
      <Link href="/painel">Meus estabelecimentos</Link>
      <Link href={`/painel/${shop}/agenda`}>Agenda</Link>
    </nav>
    <p className="eyebrow">{business.data.name}</p><h1>Financeiro</h1>
    {estado && Object.hasOwn(feedback, estado) && <p role="status">{feedback[estado]}</p>}
    {result?.error || entriesResult?.error ? <p role="alert">Não foi possível carregar os lançamentos financeiros.</p>
      : !ledger ? <div className="card panel-form">
        <h2>{setup ? "Criar senha financeira" : "Desbloquear financeiro"}</h2>
        <p>Use uma senha exclusiva do BARBERFLOW, com pelo menos oito caracteres.</p>
        <form className="account-form" action={unlockFinance.bind(null, shop, setup)}>
          <label>Senha financeira <input name="secret" type="password" minLength={8} maxLength={72} required autoComplete={setup ? "new-password" : "current-password"} /></label>
          {setup && <label>Confirmar senha financeira <input name="confirmation" type="password" minLength={8} maxLength={72} required autoComplete="new-password" /></label>}
          <SubmitButton>{setup ? "Criar senha e desbloquear" : "Desbloquear"}</SubmitButton>
        </form>
      </div> : <>
        <form action={lockFinance.bind(null, shop)}><SubmitButton>Bloquear financeiro</SubmitButton></form>
        <nav className="account-links" aria-label="Financeiro">
          <Link className="secondary" href={'/painel/' + shop + '/financeiro/pagamentos'}>Configurar Pix e cartões</Link>
          <Link className="secondary" href={`/painel/${shop}/financeiro/relatorios`}>Relatórios e fechamentos</Link>
          <Link className="secondary" href={`/painel/${shop}/financeiro/desempenho`}>Desempenho</Link>
          <Link href="?guia=fixed#lancamentos">Contas a pagar</Link>
          <Link href="?guia=receivables#lancamentos">Outros recebimentos</Link>
          <a href="#comandas">Contas a receber de comandas</a>
        </nav>
        <dl className="cards">
          <div className="card dashboard-metric"><dt>Total a receber em aberto</dt><dd>{money(ledger.open_cents + (entries?.receivable ?? 0))}</dd></div>
          <div className="card dashboard-metric"><dt>Total a pagar em aberto</dt><dd>{money(entries?.payable ?? 0)}</dd></div>
          <div className="card dashboard-metric"><dt>Recebimentos líquidos de comandas</dt><dd>{money(ledger.cash_cents)}</dd></div>
        </dl>
        {entries && <FinanceEntriesPanel shop={shop} data={entries} guide={guide} today={saoPauloToday()} />}
        <h2 className="panel-form" id="comandas">Contas a receber de comandas</h2>
        <p>Até 100 comandas, com pendências primeiro. Os totais consideram todas as comandas.</p>
        {controls?.error && <p role="alert">Não foi possível verificar as cobranças integradas. Atualize antes de alterar um recebimento.</p>}
        {ledger.bills.length ? <ul className="cards">{ledger.bills.map((bill) => {
          const remaining = bill.total_cents - bill.received_cents;
          return <li className="card" key={bill.appointment_id}>
            <h3>{bill.client_name}</h3><p>Fechada em {date(bill.closed_at)}</p>
            <dl className="order-totals">
              <div><dt>Valor da comanda</dt><dd>{money(bill.total_cents)}</dd></div>
              <div><dt>Recebido</dt><dd>{money(bill.received_cents)}</dd></div>
              <div><dt>Em aberto</dt><dd>{money(remaining)}</dd></div>
            </dl>
            <p><Link href={'/painel/' + shop + '/comanda/' + bill.appointment_id + '#recebimento'}>Abrir comanda e opções de pagamento</Link></p>
            {openCardCharges.has(bill.appointment_id) && <p>Consulte a cobrança por cartão em aberto na comanda.</p>}
            {remaining > 0 && !controls?.error && !openCardCharges.has(bill.appointment_id) && <details><summary>Registrar recebimento</summary>
              <form className="account-form" action={recordPayment.bind(null, shop, bill.appointment_id, crypto.randomUUID())}>
                <label>Valor recebido (R$) <input name="amount" inputMode="decimal" required defaultValue={(remaining / 100).toFixed(2).replace(".", ",")} /></label>
                <label>Forma de pagamento <select name="method" required defaultValue="">
                  <option value="" disabled>Selecione</option>
                  {Object.entries(methods).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select></label>
                <SubmitButton>Confirmar recebimento</SubmitButton>
              </form>
            </details>}
            {!!bill.payments.length && <details><summary>Histórico de recebimentos</summary>
              <ul>{bill.payments.map((payment) => <li key={payment.id}>
                <strong>{money(payment.amount_cents)} · {methods[payment.method]}</strong>
                <p>{date(payment.recorded_at)}</p>
                {payment.reversed_at ? <p>Estornado em {date(payment.reversed_at)} · {payment.reversal_reason}</p>
                  : integratedPayments.has(payment.id) ? <p>Cartão integrado. Solicite o estorno no provedor.</p>
                  : controls?.error || openCardCharges.has(bill.appointment_id) ? null : <details><summary>Estornar recebimento</summary>
                    <form className="account-form" action={reversePayment.bind(null, shop, payment.id)}>
                      <label>Motivo <input name="reason" maxLength={240} required /></label>
                      <SubmitButton>Confirmar estorno</SubmitButton>
                    </form>
                  </details>}
              </li>)}</ul>
            </details>}
          </li>;
        })}</ul> : <p>Nenhuma comanda fechada neste estabelecimento.</p>}
      </>}
  </section>;
}
