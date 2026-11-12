import QRCode from "qrcode";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { offsetDay, saoPauloToday } from "../../../../lib/agenda";
import { isUuid } from "../../../../lib/establishments";
import { showcasePix } from "../../../../lib/pix";
import { subscriptionLines, subscriptionProofLinks, subscriptionProofPreviews } from "../../../../lib/subscription-checkout";
import { bookingCurrency } from "../../../../lib/public-booking";
import { isPlanTier, periods, planNames, planPrice, planTiers, subscriptionPlanLabel, subscriptionSupportMessage, subscriptionSupportNumber, tierLabel, tiers, type PlanPeriod, type SubscriptionStatus } from "../../../../lib/subscriptions";
import { supabaseServer } from "../../../../lib/supabase";
import { SubscriptionProofPreview } from "../../../subscription-review-ui";
import { SubmitButton } from "../../../auth/submit";
import { issueSubscriptionPix, sendSubscriptionProof } from "./actions";
import { ProofUpload } from "./proof-upload";
import { CopyPix } from "./copy-pix";

const dateLabel = (day: string) => day.split("-").reverse().join("/");

export default async function Subscription({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ estado?: string; comprovante?: string; cobranca?: string }>;
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
  const [settings, subscription, current, history, openCharges, access] = await Promise.all([
    supabase.from("barberflow_plan_settings").select("monthly_cents,yearly_cents,premium_monthly_cents,premium_yearly_cents,trial_days,pix_key,instructions,support_whatsapp,pix_city,pix_merchant,grace_days,billing_rules,plan_benefits").single(),
    supabase.from("barberflow_subscriptions").select("trial_until,preferred_period,preferred_plan").eq("establishment_id", shop).maybeSingle(),
    supabase.from("barberflow_subscription_payments").select("plan,period,ends_before").eq("establishment_id", shop)
      .lte("starts_on", today).gt("ends_before", today).maybeSingle(),
    supabase.from("barberflow_subscription_payments").select("id,plan,period,amount_cents,confirmed_at,starts_on,ends_before")
      .eq("establishment_id", shop).order("starts_on", { ascending: false }).limit(50),
    supabase.from("barberflow_subscription_charges").select("*").eq("establishment_id", shop)
      .neq("status", "confirmed").order("created_at", { ascending: false }).limit(20),
    supabase.rpc("barberflow_subscription_status", { shop }),
  ]);
  const paymentIds = (history.data ?? []).map((payment) => payment.id);
  const archived = paymentIds.length ? await supabase.from("barberflow_subscription_charges")
    .select("payment_id,receipt_path").in("payment_id", paymentIds) : null;
  const receipts = new Map((archived?.data ?? []).map((charge) => [charge.payment_id, charge.receipt_path]));
  const proofPaths = (openCharges.data ?? []).map((charge) => charge.receipt_path);
  const [proofLinks, previews] = await Promise.all([
    subscriptionProofLinks(supabase, [...receipts.values(), ...proofPaths]),
    subscriptionProofPreviews(supabase, proofPaths),
  ]);
  const checkout = await Promise.all((openCharges.data ?? []).map(async (charge) => {
    const code = charge.status === "pending" ? showcasePix({ ...charge, total_cents: charge.amount_cents }) : null;
    return { charge, code, qr: code ? await QRCode.toDataURL(code, { scale: 6, margin: 4, errorCorrectionLevel: "M" }) : null };
  }));
  const { estado, comprovante, cobranca } = await searchParams;
  const accessStatus = access.data as SubscriptionStatus | null;
  const queued = history.data?.filter((item) => item.starts_on > today).at(-1);
  const preferred = subscription.data?.preferred_period as PlanPeriod | undefined;
  const preferredPlan = subscription.data?.preferred_plan;
  const defaultPlan = isPlanTier(preferredPlan) ? preferredPlan : isPlanTier(current.data?.plan) ? current.data.plan : "pro";
  const prices = settings.data;
  const supportNumber = prices?.support_whatsapp || subscriptionSupportNumber;
  const supportLink = "https://wa.me/" + supportNumber + "?" + new URLSearchParams({ text: subscriptionSupportMessage });

  const proofSupport = (plan: string, period: string, cents: number) => "https://wa.me/" + supportNumber + "?" +
    new URLSearchParams({ text: "Olá Top Barber, acabei de enviar o comprovante do pagamento da minha assinatura, pode liberar por favor ?" +
      `\nEstabelecimento: ${businessName}\nPlano: ${tierLabel(plan)} · ${planNames[period as PlanPeriod]}\nValor pago via Pix: ${bookingCurrency.format(cents / 100)}` });
  const pixReady = Boolean(prices?.pix_key && prices.pix_city && prices.pix_merchant);
  const feedback: Record<string, string> = {
    "acesso-expired": "Sua assinatura venceu. Envie um comprovante para renovar o acesso ao painel.",
    "acesso-blocked": "O estabelecimento está bloqueado pela administração. Fale com o suporte para regularizar.",
    "acesso-frozen": "O estabelecimento está congelado pela administração. Fale com o suporte para regularizar.",
    "pix-falha": "Não foi possível gerar o Pix. Confira se o pagamento Pix está disponível ou tente novamente.",
    "arquivo-invalido": "Selecione um PDF, JPG, JPEG, PNG, BMP ou WebP de até 5 MB.",
    "envio-falha": "Não foi possível enviar o comprovante. Confira a situação da cobrança e tente novamente.",
    enviado: "Comprovante recebido e arquivado. A administração vai conferir o pagamento.",
  };

  return <section className="container section">
    <nav className="account-links" aria-label="Estabelecimento">
      <Link href="/painel">Meus estabelecimentos</Link><Link href={`/painel/${shop}/resumo`}>Visão geral</Link>
    </nav>
    <p className="eyebrow">{businessName}</p><h1>Assinatura</h1>
    {estado && Object.hasOwn(feedback, estado) && <p role={estado === "enviado" ? "status" : "alert"}>{feedback[estado]}</p>}
    {!prices || archived?.error || [subscription, current, history, openCharges, access].some((result) => result.error) ? <p role="alert">Não foi possível carregar a assinatura.</p> : <>
      <section className="card panel-form">
        <h2>Situação da assinatura</h2>
        {accessStatus?.plan && <p className="subscription-current" data-tier={accessStatus.plan}>
          {accessStatus.plan === "premium" && <span aria-hidden="true">♛ </span>}
          <strong>{subscriptionPlanLabel(accessStatus.plan)}</strong>
          {current.data && <> · {planNames[current.data.period as PlanPeriod]}</>}
          {accessStatus.ends_before && <> · Vencimento {dateLabel(offsetDay(accessStatus.ends_before, -1))}</>}
        </p>}
        {accessStatus?.state === "expired" && <p role="status" data-feedback="warning">Acesso vencido. A área de assinatura continua disponível para renovação.</p>}
        {accessStatus?.state === "blocked" && <p role="status" data-feedback="warning">Acesso bloqueado pela administração.</p>}
        {accessStatus?.state === "frozen" && <p role="status" data-feedback="warning">Acesso congelado pela administração.</p>}
        {accessStatus?.state === "normal" && accessStatus.days_left !== null && accessStatus.days_left <= 7 &&
          <p role="status" data-feedback="warning">{accessStatus.days_left <= 0
            ? "O período contratado venceu. Renove durante o prazo de regularização."
            : accessStatus.days_left === 1 ? "Seu acesso vence hoje." : `Seu acesso vence em ${accessStatus.days_left} dias.`}</p>}
        {queued && <p>Próximo plano confirmado: {tierLabel(queued.plan)} · {planNames[queued.period as PlanPeriod]}, de {dateLabel(queued.starts_on)} a {dateLabel(offsetDay(queued.ends_before, -1))}.</p>}
      </section>
      <section aria-labelledby="subscription-options">
        <h2 id="subscription-options">Escolha seu plano</h2>
        <p>Selecione o plano e o período para gerar o Pix. Envie o comprovante da cobrança para análise. A vigência começa na data indicada após a confirmação do recebimento.</p>
        {prices.instructions && <p style={{ whiteSpace: "pre-wrap" }}>{prices.instructions}</p>}
        {!pixReady && <p role="status">O recebimento via Pix aguarda configuração da administração.</p>}
        <form className="account-form" action={issueSubscriptionPix.bind(null, shop)}>
          <div className="subscription-plans">
            {tiers.map((tier) => <fieldset key={tier} className="card subscription-plan" data-tier={tier}>
              <legend>{tier === "premium" && <span aria-hidden="true">♛ </span>}{planTiers[tier].name}</legend>
              <ul>{planTiers[tier].limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
              {periods.map((period) => <label key={period} className="subscription-option">
                <input type="radio" name="option" value={tier + ":" + period} required
                  defaultChecked={tier === defaultPlan && period === (preferred ?? "monthly")} />
                <span>{planNames[period]} · <strong>{planPrice(prices, tier, period)}</strong></span>
              </label>)}
            </fieldset>)}
          </div>
          <div className="subscription-actions">
            <SubmitButton disabled={!pixReady}>Gerar Pix do plano selecionado</SubmitButton>
            <a className="secondary subscription-whatsapp" href={supportLink} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M20 11.5a8 8 0 0 1-12 7L4 20l1.3-4A8 8 0 1 1 20 11.5Z" />
                <path d="M9 8c0 3 3 6 6 6m-6-6-1 1m7 5 1-1" strokeLinecap="round" />
              </svg>
              Suporte pelo WhatsApp
            </a>
          </div>
        </form>
      </section>
      {!!checkout.length && <h2 className="panel-form">Cobranças e comprovantes</h2>}
      {checkout.map(({ charge, code, qr }) => {
        const proof = charge.receipt_path && proofLinks.get(charge.receipt_path);
        const preview = charge.receipt_path && previews.get(charge.receipt_path);
        return <section className="card panel-form" id={"pix-" + charge.id} key={charge.id}>
          <h3>Pix · {tierLabel(charge.plan)} · {planNames[charge.period as PlanPeriod]} · {bookingCurrency.format(charge.amount_cents / 100)}</h3>
          {charge.status === "submitted" && <>
            <p role="status" data-feedback="info">Comprovante em análise.</p>
            <div className="subscription-actions"><a className="secondary subscription-whatsapp"
              href={proofSupport(charge.plan, charge.period, charge.amount_cents)} target="_blank" rel="noopener noreferrer">
              Pedir liberação pelo WhatsApp
            </a></div>
          </>}
          {charge.status === "rejected" && <p>Comprovante recusado. {charge.rejection_reason} Se precisar, fale com o suporte antes de fazer outro Pix.</p>}
          {preview && <SubscriptionProofPreview src={preview} pdf={charge.receipt_path?.endsWith(".pdf") === true} />}
          {proof && <a href={proof}>Baixar comprovante enviado</a>}
          {qr && code && <>
            <img src={qr} width={240} height={240} alt="QR Code para pagamento da assinatura via Pix" style={{ maxWidth: "100%", height: "auto" }} />
            <label>Pix Copia e Cola <textarea rows={3} value={code} readOnly /></label>
            <CopyPix value={code} code />
            <details id={"comprovante-" + charge.id} open={comprovante === charge.id || cobranca === charge.id}>
              <summary>Anexar comprovante · {planNames[charge.period as PlanPeriod]}</summary>
              <ProofUpload action={sendSubscriptionProof.bind(null, shop, charge.id)}
                highlight={cobranca === charge.id || comprovante === charge.id} />
            </details>
          </>}
        </section>;
      })}
      <section className="card panel-form">
        <h2>Regras de cobrança e troca de modalidade</h2>
        <ul>{subscriptionLines(prices.billing_rules).map((rule, index) => <li key={index}>{rule}</li>)}</ul>
        <p>{prices.grace_days > 0
          ? `Há ${prices.grace_days} dia(s) de regularização antes de bloquear o painel e novos agendamentos.`
          : "O painel e novos agendamentos são bloqueados no vencimento."} A área de assinatura permanece disponível para renovação.</p>
        {prices.plan_benefits.trim() && <><h3>O que está incluído</h3>
          <ul className="form-columns">{subscriptionLines(prices.plan_benefits).map((benefit, index) => <li key={index}>{benefit}</li>)}</ul></>}
      </section>
      <h2 className="panel-form" id="historico-pagamentos">Histórico de pagamentos</h2>
      {history.data?.length ? <ul className="cards">{history.data.map((payment) => {
        const receipt = receipts.get(payment.id);
        const proof = receipt && proofLinks.get(receipt);
        return <li className="card" key={payment.id}>
        <strong>{tierLabel(payment.plan)} · {planNames[payment.period as PlanPeriod]} · {bookingCurrency.format(payment.amount_cents / 100)}</strong>
        <p>Confirmado em {new Date(payment.confirmed_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        <p>Vigência de {dateLabel(payment.starts_on)} a {dateLabel(offsetDay(payment.ends_before, -1))}.</p>
              {proof && <a href={proof}>Baixar comprovante arquivado</a>}
        {receipt && !proof && <p role="status">Comprovante indisponível no momento. Recarregue para tentar novamente.</p>}
      </li>})}</ul> : <p>Nenhum pagamento confirmado.</p>}
    </>}
  </section>;
}
