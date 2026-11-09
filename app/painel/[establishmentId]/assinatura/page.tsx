import QRCode from "qrcode";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { offsetDay, saoPauloToday } from "../../../../lib/agenda";
import { isUuid } from "../../../../lib/establishments";
import { showcasePix } from "../../../../lib/pix";
import { subscriptionLines, subscriptionProofLinks } from "../../../../lib/subscription-checkout";
import { bookingCurrency } from "../../../../lib/public-booking";
import { planNames, planPrice, type PlanPeriod } from "../../../../lib/subscriptions";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { issueSubscriptionPix, preferPlan, sendSubscriptionProof } from "./actions";
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
  const [settings, subscription, current, history, openCharges] = await Promise.all([
    supabase.from("barberflow_plan_settings").select("monthly_cents,yearly_cents,trial_days,pix_key,instructions,pix_beneficiary,support_whatsapp,pix_city,pix_merchant,grace_days,billing_rules,plan_benefits").single(),
    supabase.from("barberflow_subscriptions").select("trial_until,preferred_period").eq("establishment_id", shop).maybeSingle(),
    supabase.from("barberflow_subscription_payments").select("period,ends_before").eq("establishment_id", shop)
      .lte("starts_on", today).gt("ends_before", today).maybeSingle(),
    supabase.from("barberflow_subscription_payments").select("id,period,amount_cents,confirmed_at,starts_on,ends_before")
      .eq("establishment_id", shop).order("starts_on", { ascending: false }).limit(50),
    supabase.from("barberflow_subscription_charges").select("*").eq("establishment_id", shop)
      .neq("status", "confirmed").order("created_at", { ascending: false }).limit(20),
  ]);
  const paymentIds = (history.data ?? []).map((payment) => payment.id);
  const archived = paymentIds.length ? await supabase.from("barberflow_subscription_charges")
    .select("payment_id,receipt_path").in("payment_id", paymentIds) : null;
  const receipts = new Map((archived?.data ?? []).map((charge) => [charge.payment_id, charge.receipt_path]));
  const proofLinks = await subscriptionProofLinks(supabase, [
    ...receipts.values(), ...(openCharges.data ?? []).map((charge) => charge.receipt_path),
  ]);
  const checkout = await Promise.all((openCharges.data ?? []).map(async (charge) => {
    const code = charge.status === "pending" ? showcasePix({ ...charge, total_cents: charge.amount_cents }) : null;
    return { charge, code, qr: code ? await QRCode.toDataURL(code, { width: 240, margin: 4 }) : null };
  }));
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

  const pixReady = Boolean(prices?.pix_key && prices.pix_city && prices.pix_merchant);
  const feedback: Record<string, string> = {
    "pix-falha": "Não foi possível gerar o Pix. Confira se o pagamento Pix está disponível ou tente novamente.",
    "arquivo-invalido": "Selecione um PDF, JPG, PNG ou WebP de até 5 MB.",
    "envio-falha": "Não foi possível enviar o comprovante. Confira a situação da cobrança e tente novamente.",
    enviado: "Comprovante recebido e arquivado. A administração vai conferir o pagamento.",
  };

  return <section className="container section">
    <nav className="account-links" aria-label="Estabelecimento">
      <Link href="/painel">Meus estabelecimentos</Link><Link href={`/painel/${shop}/resumo`}>Visão geral</Link>
    </nav>
    <p className="eyebrow">{businessName}</p><h1>Assinatura</h1>
    {estado === "salvo" && <p role="status">Preferência de plano salva.</p>}
    {estado === "falha" && <p role="alert">Não foi possível salvar a preferência.</p>}
    {estado && Object.hasOwn(feedback, estado) && <p role={estado === "enviado" ? "status" : "alert"}>{feedback[estado]}</p>}
    {!prices || archived?.error || [subscription, current, history, openCharges].some((result) => result.error) ? <p role="alert">Não foi possível carregar a assinatura.</p> : <>
      <section className="card panel-form">
        <h2>Situação da assinatura</h2>
        {current.data ? <p>Plano {planNames[current.data.period as PlanPeriod].toLowerCase()} ativo até {dateLabel(offsetDay(current.data.ends_before, -1))}.</p>
          : trialActive && trialUntil ? <p>Teste grátis ativo até {dateLabel(offsetDay(trialUntil, -1))}.</p>
          : trialUntil ? <p>Teste grátis encerrado em {dateLabel(trialUntil)}.</p> : <p>Estabelecimento sem período de teste registrado.</p>}
        {daysLeft !== null && daysLeft > 0 && daysLeft <= 7 && <p role="status">Renovação em {daysLeft} {daysLeft === 1 ? "dia" : "dias"}.</p>}
        {daysLeft !== null && daysLeft <= 0 && <p role="status">{daysLeft > -prices.grace_days
          ? `A assinatura venceu. Prazo de regularização até ${dateLabel(offsetDay(lastEnd!, prices.grace_days - 1))}.`
          : "Novos agendamentos públicos pausados até a regularização."}</p>}
        {queued && <p>Próximo plano confirmado: {planNames[queued.period as PlanPeriod]}, de {dateLabel(queued.starts_on)} a {dateLabel(offsetDay(queued.ends_before, -1))}.</p>}
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
        <p>Gere o Pix para o plano escolhido e envie o comprovante por aqui. A vigência é registrada assim que a administração confirmar o recebimento.</p>
        {pixReady ? <>
          <p style={{ overflowWrap: "anywhere" }}>Chave Pix <strong>{prices.pix_key}</strong></p>
          <CopyPix value={prices.pix_key} />
          <p>Favorecido: {prices.pix_beneficiary}</p>
          <div className="account-links">
            {(Object.keys(planNames) as PlanPeriod[]).map((period) =>
              <form key={period} action={issueSubscriptionPix.bind(null, shop, period)}>
                <SubmitButton>{`Gerar Pix · ${planNames[period]} · ${planPrice(prices, period)}`}</SubmitButton>
              </form>)}
          </div>
        </> : <p>A configuração de recebimento Pix está pendente na administração.</p>}
        {prices.support_whatsapp && <a href={"https://wa.me/" + prices.support_whatsapp} target="_blank" rel="noopener noreferrer">Suporte pelo WhatsApp</a>}
      </section>
      {checkout.map(({ charge, code, qr }) => {
        const proof = charge.receipt_path && proofLinks.get(charge.receipt_path);
        return <section className="card panel-form" id={"pix-" + charge.id} key={charge.id}>
          <h3>Pix {planNames[charge.period as PlanPeriod]} · {bookingCurrency.format(charge.amount_cents / 100)}</h3>
          {charge.status === "submitted" && <p role="status">Comprovante em análise.</p>}
          {charge.status === "rejected" && <p>Comprovante recusado. {charge.rejection_reason} Se precisar, fale com o suporte antes de fazer outro Pix.</p>}
          {proof && <a href={proof}>Baixar comprovante enviado</a>}
          {qr && code && <>
            <p>Favorecido: {charge.merchant}</p>
            <img src={qr} width={240} height={240} alt="QR Code para pagamento da assinatura via Pix" style={{ maxWidth: "100%", height: "auto" }} />
            <label>Pix Copia e Cola <textarea rows={3} value={code} readOnly /></label>
            <CopyPix value={code} code />
            <form className="account-form" action={sendSubscriptionProof.bind(null, shop, charge.id)}>
              <label>Comprovante do pagamento (PDF, JPG, PNG ou WebP, até 5 MB)
                <input name="proof" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
              </label>
              <SubmitButton>Enviar comprovante</SubmitButton>
            </form>
          </>}
        </section>;
      })}
      <section className="card panel-form">
        <h2>Regras de cobrança e troca de modalidade</h2>
        <ul>{subscriptionLines(prices.billing_rules).map((rule, index) => <li key={index}>{rule}</li>)}</ul>
        <p>{prices.grace_days > 0
          ? `Há ${prices.grace_days} dia(s) de regularização antes de pausar novos agendamentos públicos.`
          : "Novos agendamentos públicos são pausados no vencimento."} Histórico e exportações continuam disponíveis.</p>
        {prices.plan_benefits.trim() && <><h3>O que está incluído</h3>
          <ul className="form-columns">{subscriptionLines(prices.plan_benefits).map((benefit, index) => <li key={index}>{benefit}</li>)}</ul></>}
      </section>
      <h2 className="panel-form">Histórico de pagamentos</h2>
      {history.data?.length ? <ul className="cards">{history.data.map((payment) => {
        const receipt = receipts.get(payment.id);
        const proof = receipt && proofLinks.get(receipt);
        return <li className="card" key={payment.id}>
        <strong>{planNames[payment.period as PlanPeriod]} · {bookingCurrency.format(payment.amount_cents / 100)}</strong>
        <p>Confirmado em {new Date(payment.confirmed_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        <p>Vigência de {dateLabel(payment.starts_on)} a {dateLabel(offsetDay(payment.ends_before, -1))}.</p>
              {proof && <a href={proof}>Baixar comprovante arquivado</a>}
        {receipt && !proof && <p role="status">Comprovante indisponível no momento. Recarregue para tentar novamente.</p>}
      </li>})}</ul> : <p>Nenhum pagamento confirmado.</p>}
    </>}
  </section>;
}
