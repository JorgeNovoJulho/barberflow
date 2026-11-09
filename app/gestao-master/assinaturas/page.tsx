import Link from "next/link";
import { requireMaster } from "../../../lib/master";
import { bookingCurrency } from "../../../lib/public-booking";
import { planNames, type PlanPeriod } from "../../../lib/subscriptions";
import { SubmitButton } from "../../auth/submit";
import { confirmSubscriptionPayment, savePlanSettings } from "./actions";

const feedback: Record<string, string> = {
  configurado: "Configuração de assinatura salva.",
  confirmado: "Pagamento registrado.",
  duplicado: "Esta referência já consta no histórico do estabelecimento.",
  invalido: "Confira os dados informados.",
  falha: "Não foi possível concluir a operação.",
};
const amount = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export default async function BillingAdmin({ searchParams }: { searchParams: Promise<{ busca?: string; estado?: string }> }) {
  const supabase = await requireMaster();
  const { busca, estado } = await searchParams;
  const search = typeof busca === "string" ? busca.trim().slice(0, 120) : "";
  const [settings, businesses] = await Promise.all([
    supabase.from("barberflow_plan_settings").select("monthly_cents,yearly_cents,trial_days,pix_key,instructions,pix_beneficiary,support_whatsapp").single(),
    search ? supabase.rpc("barberflow_billing_businesses", { search_text: search }) : Promise.resolve({ data: [], error: null }),
  ]);
  const config = settings.data;
  const shops = (businesses.data ?? []) as { id: string; name: string }[];
  const selected = shops.length === 1 ? shops[0] : undefined;
  const [subscription, history] = selected ? await Promise.all([
    supabase.from("barberflow_subscriptions").select("preferred_period").eq("establishment_id", selected.id).maybeSingle(),
    supabase.from("barberflow_subscription_payments").select("id,period,amount_cents,reference,starts_on,ends_before")
      .eq("establishment_id", selected.id).order("starts_on", { ascending: false }).limit(50),
  ]) : [null, null];
  const preferred = subscription?.data?.preferred_period as PlanPeriod | undefined;

  return <section className="container section">
    <Link href="/gestao-master">Voltar à administração</Link>
    <h1>Gestão de assinaturas</h1>
    {estado && Object.hasOwn(feedback, estado) && <p role="status">{feedback[estado]}</p>}
    <h2>Configuração dos planos</h2>
    {config ? <form className="card account-form panel-form" action={savePlanSettings}>
      <div className="form-columns">
        <label>Mensal (R$) <input name="monthly" inputMode="decimal" defaultValue={amount(config.monthly_cents)} required /></label>
        <label>Anual (R$) <input name="yearly" inputMode="decimal" defaultValue={amount(config.yearly_cents)} required /></label>
        <label>Dias de teste para novos estabelecimentos <input name="trial" type="number" min={0} max={365} defaultValue={config.trial_days} required /></label>
      </div>
      <label>Chave Pix <input name="pix" maxLength={160} defaultValue={config.pix_key} /></label>
      <label>Favorecido Pix <input name="beneficiary" maxLength={120} defaultValue={config.pix_beneficiary} /></label>
      <label>WhatsApp para comprovantes <input name="whatsapp" type="tel" maxLength={22} defaultValue={config.support_whatsapp} placeholder="+55 DDD número" /></label>
      <label>Instruções de pagamento <textarea name="instructions" rows={4} maxLength={1500} defaultValue={config.instructions} /></label>
      <SubmitButton>Salvar configuração</SubmitButton>
    </form> : <p role="alert">Não foi possível carregar a configuração.</p>}
    <h2 className="panel-form">Estabelecimentos e pagamentos</h2>
    <form className="agenda-date">
      <label>Nome ou identificador <input name="busca" defaultValue={search} maxLength={120} required /></label>
      <button type="submit" className="secondary">Buscar</button>
    </form>
    {businesses.error ? <p role="alert">Não foi possível buscar os estabelecimentos.</p>
      : search && !shops.length ? <p>Nenhum estabelecimento encontrado.</p>
      : shops.length > 1 && <ul className="cards">{shops.map((shop) => <li className="card" key={shop.id}>
        <Link href={`?busca=${shop.id}`}>{shop.name} · {shop.id.slice(0, 8)}</Link>
      </li>)}</ul>}
    {selected && <section className="card panel-form">
      <h3>{selected.name}</h3>
      {subscription?.error ? <p role="alert">Não foi possível consultar a preferência.</p> : <p>Preferência do proprietário: {preferred ? planNames[preferred] : "Sem preferência"}</p>}
      <form className="account-form" action={confirmSubscriptionPayment.bind(null, selected.id)}>
        <label>Modalidade <select name="period" defaultValue={preferred ?? "monthly"}>
          {Object.entries(planNames).map(([id, name]) => <option value={id} key={id}>{name}</option>)}
        </select></label>
        <label>Valor recebido (R$) <input name="amount" inputMode="decimal" required /></label>
        <label>Referência do pagamento <input name="reference" required maxLength={160} /></label>
        <SubmitButton>Registrar pagamento confirmado</SubmitButton>
      </form>
      <h3>Últimos pagamentos confirmados</h3>
      {history?.error ? <p role="alert">Não foi possível consultar o histórico.</p> : history?.data?.length ? <ul>{history.data.map((payment) => <li key={payment.id}>
        {planNames[payment.period as PlanPeriod]} · {bookingCurrency.format(payment.amount_cents / 100)} · {payment.reference}
      </li>)}</ul> : <p>Nenhum pagamento confirmado.</p>}
    </section>}
  </section>;
}
