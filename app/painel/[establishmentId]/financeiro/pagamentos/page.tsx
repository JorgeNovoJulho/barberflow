import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../../lib/establishments";
import { cardAdmin } from "../../../../../lib/card-payments";
import { pixLabel } from "../../../../../lib/pix";
import { supabaseServer } from "../../../../../lib/supabase";
import { SubmitButton } from "../../../../auth/submit";
import { saveBusinessPix, saveCardAccount } from "./actions";
import { paymentFeedback } from "./feedback";

export default async function PaymentSettings({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ pagamento?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const path = `/painel/${shop}/financeiro`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) {
    redirect("/login?" + new URLSearchParams({ next: path + "/pagamentos" }));
  }
  const [business, access] = await Promise.all([
    supabase.from("barberflow_establishments").select("name,city").eq("id", shop).maybeSingle(),
    supabase.rpc("barberflow_finance_status", { shop }),
  ]);
  if (business.error || access.error) throw new Error("Não foi possível consultar a configuração de pagamentos.");
  if (!business.data || access.data === "denied") notFound();
  if (access.data !== "unlocked") redirect(path);
  const [pix, cards] = await Promise.all([
    supabase.rpc("barberflow_business_pix", { shop }),
    supabase.rpc("barberflow_card_status", { shop }),
  ]);
  const { pagamento } = await searchParams;
  const cardAvailable = !!cardAdmin();
  const account = cards.data?.account as { collector: number; sandbox: boolean } | null | undefined;
  return <section className="container section" id="recebimento">
    <Link href={path}>Voltar ao Financeiro</Link>
    <p className="eyebrow">{business.data.name}</p>
    <h1>Configuração de recebimentos</h1>
    {pagamento && Object.hasOwn(paymentFeedback, pagamento) && <p role="status">{paymentFeedback[pagamento]}</p>}
    <section className="card panel-form">
      <h2>Conta Pix do estabelecimento</h2>
      <p>A mesma chave recebe pagamentos das comandas e da vitrine. Cadastre uma chave já registrada no banco.</p>
      {pix.error ? <p role="alert">Não foi possível carregar a conta Pix.</p> : <>
        <form className="account-form" action={saveBusinessPix.bind(null, shop, false)}>
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
      <p>O checkout abre no Mercado Pago. As opções de cartão dependem da conta e dos meios disponíveis no provedor.</p>
      {cards.error ? <p role="alert">Não foi possível carregar a conta de cartões.</p> : <>
        <p>{account ? `Conta ${account.collector} conectada · ${account.sandbox ? "teste" : "produção"}` : "Conta Mercado Pago ainda não conectada."}</p>
        {!cardAvailable && <p role="status">Integração aguardando configuração do servidor.</p>}
        <form className="account-form" action={saveCardAccount.bind(null, shop, false)}>
          <label>Ambiente <select name="mode" defaultValue={account?.sandbox === false ? "live" : "test"}>
            <option value="test">Teste</option><option value="live">Produção</option>
          </select></label>
          <label>Access Token <input name="token" type="password" autoComplete="off" minLength={20} maxLength={300}
            required disabled={!cardAvailable} /></label>
          <SubmitButton disabled={!cardAvailable}>Validar e conectar Mercado Pago</SubmitButton>
        </form>
        {account && <form action={saveCardAccount.bind(null, shop, true)}>
          <button className="secondary" type="submit" disabled={!cardAvailable}>Desconectar para novas cobranças</button>
        </form>}
      </>}
    </section>
  </section>;
}
