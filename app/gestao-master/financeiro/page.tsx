import Link from "next/link";
import { requireMaster } from "../../../lib/master";
import { bookingCurrency } from "../../../lib/public-booking";
import { planNames, type PlanPeriod } from "../../../lib/subscriptions";
import { SubmitButton } from "../../auth/submit";
import { MasterCards, MasterPagination, MasterTabs, masterDate, reportPage } from "../master-ui";
import { controlSubscription } from "./actions";

const path = "/gestao-master/financeiro";
const states = { normal: "Normal", frozen: "Congelado", blocked: "Bloqueado", bonus: "Bônus" };
type Shop = { id: string; name: string; city: string; status: keyof typeof states; bonus_until: string | null;
  trial_until: string | null; paid_until: string | null; valid_until: string | null };
type Payment = { id: string; name: string; period: PlanPeriod; amount_cents: number; reference: string;
  confirmed_at: string; starts_on: string; ends_before: string; renewal: boolean };
type History = { id: number; name: string; operation: keyof typeof states; reason: string; created_at: string; bonus_until: string | null };
type Report = { total: number; payments_total: number; paid: number; restricted: number; valid: number;
  shops: Shop[]; payments: Payment[]; history: History[] };

export default async function FinanceAdmin({ searchParams }: { searchParams: Promise<{ busca?: string; pagina?: string; estado?: string }> }) {
  const supabase = await requireMaster(path);
  const params = await searchParams;
  const search = typeof params.busca === "string" ? params.busca.trim().slice(0,120) : "";
  const page = reportPage(params.pagina);
  const { data } = await supabase.rpc("barberflow_master_finance", { search_text: search, page_index: page });
  const report = data as Report | null;
  return <section className="container section">
    <MasterTabs current={path} />
    <h1>Financeiro</h1>
    {params.estado === "salvo" && <p role="status">Alteração registrada no histórico.</p>}
    {params.estado === "falha" && <p role="alert">Confira o estabelecimento, o motivo e o prazo informado.</p>}
    {report ? <>
      <MasterCards items={[["Receita confirmada", bookingCurrency.format(report.paid / 100)], ["Pagamentos", report.payments_total],
        ["Estabelecimentos vigentes", report.valid], ["Congelados ou bloqueados", report.restricted]]} />
      <form className="agenda-date">
        <label>Estabelecimento <input name="busca" maxLength={120} defaultValue={search} /></label>
        <button type="submit" className="secondary">Buscar</button>
      </form>
      <h2>Vigência e controle de acesso</h2>
      <p>Congelar pausa novos agendamentos públicos e compras. Bloquear também restringe o acesso ao painel do estabelecimento. A vigência paga continua seguindo as datas registradas.</p>
      <ul className="cards">{report.shops.map((shop) => <li className="card" key={shop.id}>
        <h3>{shop.name}</h3><p>{shop.city} · {states[shop.status]}</p>
        <dl className="order-totals">
          <div><dt>Fim da vigência (data exclusiva)</dt><dd>{masterDate(shop.valid_until)}</dd></div>
          <div><dt>Fim do período pago</dt><dd>{masterDate(shop.paid_until)}</dd></div>
          <div><dt>Fim do teste</dt><dd>{masterDate(shop.trial_until)}</dd></div>
          <div><dt>Fim do bônus</dt><dd>{masterDate(shop.bonus_until)}</dd></div>
        </dl>
        <Link href={`/gestao-master/assinaturas?busca=${shop.id}`}>Ver comprovantes e registrar pagamento</Link>
        <details><summary>Alterar acesso</summary>
          <form className="account-form" action={controlSubscription.bind(null,shop.id)}>
            <label>Ação <select name="operation" required defaultValue="">
              <option value="" disabled>Selecione</option><option value="normal">Reativar</option>
              <option value="frozen">Congelar</option><option value="blocked">Bloquear</option><option value="bonus">Conceder bônus</option>
            </select></label>
            <label>Dias (somente para bônus) <input name="days" type="number" min={1} max={365} /></label>
            <label>Motivo <input name="reason" minLength={3} maxLength={400} required /></label>
            <SubmitButton>Registrar alteração</SubmitButton>
          </form>
        </details>
      </li>)}</ul>
      <h2>Assinaturas e renovações confirmadas</h2>
      {report.payments.length ? <ul className="cards">{report.payments.map(payment => <li className="card" key={payment.id}>
        <h3>{payment.name}</h3>
        <p>{payment.renewal ? "Renovação" : "Nova assinatura"} · {planNames[payment.period]} · {bookingCurrency.format(payment.amount_cents / 100)}</p>
        <p>De {masterDate(payment.starts_on)} até {masterDate(payment.ends_before)} (data final exclusiva).</p>
        <p>Confirmado em {masterDate(payment.confirmed_at)} · Ref. {payment.reference}</p>
      </li>)}</ul> : <p>Nenhum pagamento nesta página.</p>}
      <MasterPagination page={page} total={Math.max(report.total, report.payments_total)} search={search} />
      <h2>Últimas alterações de acesso</h2>
      {report.history.length ? <ul className="cards">{report.history.map(item => <li className="card" key={item.id}>
        <strong>{item.name} · {states[item.operation]}</strong><p>{masterDate(item.created_at)} · {item.reason}</p>
        {item.bonus_until && <p>Fim do bônus: {masterDate(item.bonus_until)}</p>}
      </li>)}</ul> : <p>Nenhuma alteração registrada.</p>}
    </> : <p role="alert">Não foi possível carregar o relatório financeiro.</p>}
  </section>;
}
