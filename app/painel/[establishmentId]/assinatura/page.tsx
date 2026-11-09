import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { offsetDay, saoPauloToday } from "../../../../lib/agenda";
import { isUuid } from "../../../../lib/establishments";
import { bookingCurrency } from "../../../../lib/public-booking";
import { planNames, planPrice, type PlanPeriod } from "../../../../lib/subscriptions";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { preferPlan } from "./actions";
import { CopyPix } from "./copy-pix";

const dateLabel = (day: string) => day.split("-").reverse().join("/");

export default async function Subscription({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const path = `/painel/${shop}/assinatura`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  const business = await supabase.from("barberflow_establishments").select("name").eq("id", shop).maybeSingle();
  if (business.error) throw new Error("Não foi possível consultar o estabelecimento.");
  if (!business.data) notFound();
  const businessName = business.data.name;
  const today = saoPauloToday();
  const [settings, subscription, current, history] = await Promise.all([
    supabase.from("barberflow_plan_settings").select("monthly_cents,yearly_cents,trial_days,pix_key,instructions,pix_beneficiary,support_whatsapp").single(),
    supabase.from("barberflow_subscriptions").select("trial_until,preferred_period").eq("establishment_id", shop).maybeSingle(),
    supabase.from("barberflow_subscription_payments").select("period,ends_before").eq("establishment_id", shop)
      .lte("starts_on", today).gt("ends_before", today).maybeSingle(),
    supabase.from("barberflow_subscription_payments").select("id,period,amount_cents,confirmed_at,starts_on,ends_before")
      .eq("establishment_id", shop).order("starts_on", { ascending: false }).limit(50),
  ]);
  const { estado } = await searchParams;
  const trialUntil = subscription.data?.trial_until;
  const trialActive = Boolean(trialUntil && trialUntil > today);
  const queued = history.data?.filter((item) => item.starts_on > today).at(-1);
  const preferred = subscription.data?.preferred_period as PlanPeriod | undefined;
  const prices = settings.data;
  const lastEnd = [trialUntil, current.data?.ends_before, ...((history.data ?? []).map((payment) => payment.ends_before))]
    .filter((day): day is string => !!day).sort().at(-1);
  const daysLeft = lastEnd ? Math.round((Date.parse(lastEnd) - Date.parse(today)) / 86400000) : null;
  const saving = prices ? Math.max(0, 12 * prices.monthly_cents - prices.yearly_cents) : 0;

  return <section className="container section">
    <nav className="account-links" aria-label="Estabelecimento">
      <Link href="/painel">Meus estabelecimentos</Link><Link href={`/painel/${shop}/resumo`}>Visão geral</Link>
    </nav>
    <p className="eyebrow">{businessName}</p><h1>Assinatura</h1>
    {estado === "salvo" && <p role="status">Preferência de plano salva.</p>}
    {estado === "falha" && <p role="alert">Não foi possível salvar a preferência.</p>}
    {!prices || [subscription, current, history].some((result) => result.error) ? <p role="alert">Não foi possível carregar a assinatura.</p> : <>
      <section className="card panel-form">
        <h2>Situação da assinatura</h2>
        {current.data ? <p>Plano {planNames[current.data.period as PlanPeriod].toLowerCase()} ativo até {dateLabel(offsetDay(current.data.ends_before, -1))}.</p>
          : trialActive && trialUntil ? <p>Teste grátis ativo até {dateLabel(offsetDay(trialUntil, -1))}.</p>
          : trialUntil ? <p>Teste grátis encerrado em {dateLabel(trialUntil)}.</p> : <p>Estabelecimento sem período de teste registrado.</p>}
        {daysLeft !== null && daysLeft > 0 && daysLeft <= 7 && <p role="status">Renovação em {daysLeft} {daysLeft === 1 ? "dia" : "dias"}.</p>}
        {daysLeft !== null && daysLeft <= 0 && <p role="status">{daysLeft > -3
          ? "A assinatura venceu. Regularize em até três dias para manter novos agendamentos públicos."
          : "Novos agendamentos públicos pausados até a regularização."}</p>}
        {queued && <p>Próximo plano confirmado: {planNames[queued.period as PlanPeriod]} a partir de {dateLabel(queued.starts_on)}.</p>}
      </section>
      <h2 className="panel-form">Escolher modalidade</h2>
      <form className="account-form card" action={preferPlan.bind(null, shop)}>
        <fieldset><legend>Preferência para o próximo pagamento</legend>
          {(Object.keys(planNames) as PlanPeriod[]).map((period) => <label key={period}>
            <input type="radio" name="period" value={period} defaultChecked={preferred === period} required /> {planNames[period]} · {planPrice(prices, period)}
          </label>)}
        </fieldset>
        {saving > 0 && <p>Economize {bookingCurrency.format(saving / 100)} no anual em comparação com 12 mensalidades.</p>}
        <SubmitButton>Salvar preferência</SubmitButton>
      </form>
      <section className="card panel-form">
        <h2>Como pagar</h2>
        {prices.instructions && <p style={{ whiteSpace: "pre-wrap" }}>{prices.instructions}</p>}
        {prices.pix_key ? <><p style={{ overflowWrap: "anywhere" }}>{prices.pix_key}</p><CopyPix value={prices.pix_key} /></>
          : !prices.instructions && <p>As instruções de pagamento ainda não foram configuradas.</p>}
        {prices.pix_beneficiary && <p>Favorecido: {prices.pix_beneficiary}</p>}
        {prices.support_whatsapp && prices.pix_key && <div className="account-links">
          {(Object.keys(planNames) as PlanPeriod[]).map((period) => <a key={period} className="secondary"
            href={"https://wa.me/" + prices.support_whatsapp + "?" + new URLSearchParams({
              text: "Olá! Segue o comprovante do plano " + planNames[period] + " (" + planPrice(prices, period)
                + ") do estabelecimento " + businessName + " · " + shop,
            })} target="_blank" rel="noopener noreferrer">Enviar comprovante · {planNames[period]}</a>)}
        </div>}
        <h3>Regras de cobrança e troca de modalidade</h3>
        <p>O pagamento é confirmado pela administração. A vigência começa após o teste ou o último período confirmado, se houver. Salvar a preferência não efetua cobrança. Após o vencimento, há três dias para regularizar antes de pausar novos agendamentos públicos.</p>
      </section>
      <h2 className="panel-form">Histórico de pagamentos</h2>
      {history.data?.length ? <ul className="cards">{history.data.map((payment) => <li className="card" key={payment.id}>
        <strong>{planNames[payment.period as PlanPeriod]} · {bookingCurrency.format(payment.amount_cents / 100)}</strong>
        <p>Confirmado em {new Date(payment.confirmed_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        <p>Vigência de {dateLabel(payment.starts_on)} a {dateLabel(offsetDay(payment.ends_before, -1))}.</p>
      </li>)}</ul> : <p>Nenhum pagamento confirmado.</p>}
    </>}
  </section>;
}
