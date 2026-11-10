import { authOrigin } from "../../../../../lib/auth-path";
import { showcaseWebhookToken } from "../../../../../lib/showcase-asaas";
import { PasswordField } from "../password-field";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../../lib/establishments";
import { cardAdmin, cardProviders, type CardProvider } from "../../../../../lib/card-payments";
import { pixLabel } from "../../../../../lib/pix";
import { supabaseServer } from "../../../../../lib/supabase";
import { SubmitButton } from "../../../../auth/submit";
import { saveBusinessPix, saveCardAccount, setShowcaseAsaas } from "./actions";
import { paymentFeedback } from "./feedback";

export default async function PaymentSettings({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ pagamento?: string; comanda?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const path = `/painel/${shop}/financeiro`;
  const { pagamento, comanda } = await searchParams;
  const sale = comanda && isUuid(comanda) ? comanda : null;
  const query = sale ? "?comanda=" + sale : "";
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) {
    redirect("/login?" + new URLSearchParams({ next: path + "/pagamentos" + query }));
  }
  const [business, access] = await Promise.all([
    supabase.from("barberflow_establishments").select("name,city").eq("id", shop).maybeSingle(),
    supabase.rpc("barberflow_finance_status", { shop }),
  ]);
  if (business.error || access.error) throw new Error("Não foi possível consultar a configuração de pagamentos.");
  if (!business.data || access.data === "denied") notFound();
  if (access.data !== "unlocked") redirect(path + query);
  const [pix, cards, showcase] = await Promise.all([
    supabase.rpc("barberflow_business_pix", { shop }),
    supabase.rpc("barberflow_card_status", { shop }),
    supabase.from("barberflow_showcase_pix").select("asaas_enabled").eq("establishment_id", shop).maybeSingle(),
  ]);
  const cardAvailable = !!cardAdmin();
  const account = cards.data?.account as { provider: CardProvider; sandbox: boolean } | null | undefined;
  const webhookToken = cardAvailable && account?.provider === "asaas" && !account.sandbox ? showcaseWebhookToken(shop) : null;
  const showcaseEnabled = showcase.data?.asaas_enabled === true;
  return <section className="container section" id="recebimento">
    <Link href={path}>Voltar ao Financeiro</Link>
    <p className="eyebrow">{business.data.name}</p>
    <h1>Configuração de recebimentos</h1>
    {pagamento && Object.hasOwn(paymentFeedback, pagamento) && <p role="status">{paymentFeedback[pagamento]}</p>}
    <section className="card panel-form" id="conta-pix">
      <h2>Conta Pix do estabelecimento</h2>
      <p>A mesma chave recebe pagamentos das comandas e da vitrine. Cadastre uma chave já registrada no banco.</p>
      {pix.error ? <p role="alert">Não foi possível carregar a conta Pix.</p> : <>
        {sale && <p>Ao salvar a conta Pix, você volta à comanda para gerar a cobrança.</p>}
        <form className="account-form" action={saveBusinessPix.bind(null, shop, false)}>
          {sale && <input type="hidden" name="comanda" value={sale} />}
          <label>Chave Pix <input name="key" maxLength={77} required defaultValue={pix.data?.pix_key} /></label>
          <label>Nome do recebedor <input name="merchant" maxLength={25} required
            defaultValue={pix.data?.merchant ?? pixLabel(business.data.name, 25)} /></label>
          <label>Cidade do recebedor <input name="city" maxLength={15} required
            defaultValue={pix.data?.city ?? pixLabel(business.data.city, 15)} /></label>
          <SubmitButton>Salvar conta Pix</SubmitButton>
        </form>
        {pix.data && <form action={saveBusinessPix.bind(null, shop, true)}>
          <button className="secondary" type="submit">Desativar Pix</button>
        </form>}
      </>}
    </section>
    <section className="card panel-form">
      <h2>Cartões de crédito e débito</h2>
      <p>Escolha Asaas para crédito ou Mercado Pago para crédito e débito, conforme disponibilidade da conta.</p>
      {cards.error ? <p role="alert">Não foi possível carregar a conta de cartões.</p> : <>
        <p>{account ? `${cardProviders[account.provider]} conectado · ${account.sandbox ? "teste" : "produção"}` : "Nenhum provedor conectado."}</p>
        {!cardAvailable && <p role="status">Integração aguardando configuração do servidor.</p>}
        <form className="account-form" action={saveCardAccount.bind(null, shop, false)}>
          <label>Provedor <select name="provider" defaultValue={account?.provider ?? "asaas"}>
            <option value="asaas">Asaas</option><option value="mercado_pago">Mercado Pago</option>
          </select></label>
          <label>Ambiente <select name="mode" defaultValue={account?.sandbox === false ? "live" : "test"}>
            <option value="test">Teste</option><option value="live">Produção</option>
          </select></label>
          <PasswordField label="Access Token" name="token" autoComplete="off" minLength={20} maxLength={300} disabled={!cardAvailable} />
          <SubmitButton disabled={!cardAvailable}>Validar e conectar provedor</SubmitButton>
        </form>
        {account && <form action={saveCardAccount.bind(null, shop, true)}>
          <button className="secondary" type="submit" disabled={!cardAvailable}>Desconectar para novas cobranças</button>
        </form>}
      </>}
    </section>
    <section className="card panel-form">
      <h2>Confirmação automática do Pix da vitrine</h2>
      {showcase.error ? <p role="alert">Não foi possível consultar a configuração da vitrine.</p> :
        <p>{showcaseEnabled ? "Ativa para novos pedidos." : "Novos pedidos usam confirmação pelo extrato."}</p>}
      {webhookToken && pix.data ? <>
        <details>
          <summary>Configurar retorno no Asaas</summary>
          <p>Use na vitrine uma chave Pix registrada na mesma conta Asaas. No painel do Asaas, cadastre um webhook de produção para o evento <code>PAYMENT_RECEIVED</code>.</p>
          <label>URL do webhook <input readOnly value={authOrigin() + "/api/asaas/vitrine/" + shop} /></label>
          <label>Token de autenticação do webhook <input readOnly type="password" value={webhookToken} /></label>
          <p>Selecione e copie o token para o Asaas. Guarde-o como segredo.</p>
        </details>
        {!showcaseEnabled && !showcase.error && <form className="account-form" action={setShowcaseAsaas.bind(null, shop, true)}>
          <label><input type="checkbox" required /> Cadastrei o webhook no Asaas e confirmei a chave Pix da conta.</label>
          <SubmitButton>Ativar confirmação automática</SubmitButton>
        </form>}
      </> : <p>Salve a chave Pix e conecte uma conta Asaas em produção para configurar a confirmação automática.</p>}
      {showcaseEnabled && <form action={setShowcaseAsaas.bind(null, shop, false)}>
        <button type="submit" className="secondary">Desativar para novos pedidos</button>
      </form>}
    </section>
  </section>;
}
