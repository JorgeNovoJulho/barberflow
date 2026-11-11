import type { Metadata } from "next";
import Link from "next/link";
import { planPrice, planTiers, tiers } from "../../lib/subscriptions";
import { supabaseServer } from "../../lib/supabase";

export const metadata: Metadata = { title: "Planos" };

export default async function Plans() {
  const supabase = await supabaseServer();
  const settings = await supabase?.from("barberflow_plan_settings")
    .select("monthly_cents,yearly_cents,premium_monthly_cents,premium_yearly_cents,trial_days").single();
  const prices = settings?.data;
  return <section className="container section">
    <p className="eyebrow">Assinatura por estabelecimento</p>
    <h1>Planos TOP BARBER</h1>
    <p className="intro">Escolha Pro ou Premium e pague por Pix, na modalidade mensal ou anual.
      {prices?.trial_days ? ` O teste de ${prices.trial_days} dias dispensa cartão.` : ""}</p>
    {!prices && <p role="alert">Os preços estão temporariamente indisponíveis.</p>}
    <div className="subscription-plans">
      {tiers.map((tier) => <article key={tier} className="card subscription-plan" data-tier={tier}>
        <h2>{planTiers[tier].name}</h2>
        {prices && <><p><strong className="price">{planPrice(prices, tier, "monthly")}</strong> por mês</p>
          <p><strong>{planPrice(prices, tier, "yearly")}</strong> por ano</p></>}
        <ul>{planTiers[tier].limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
      </article>)}
    </div>
    <div className="account-links"><Link className="primary" href="/cadastro">Criar conta</Link>
      <Link className="secondary" href="/painel">Acessar meu painel</Link></div>
  </section>;
}
