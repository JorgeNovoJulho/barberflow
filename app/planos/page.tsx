import { PlanCatalog } from "../plan-catalog";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer } from "../../lib/supabase";

export const metadata: Metadata = { title: "Planos" };

export default async function Plans() {
  const supabase = await supabaseServer();
  const settings = await supabase?.from("barberflow_plan_settings")
    .select("monthly_cents,yearly_cents,premium_monthly_cents,premium_yearly_cents,unlimited_monthly_cents,unlimited_yearly_cents,trial_days").single();
  const prices = settings?.data;
  return <section className="container section">
    <p className="eyebrow">Assinatura por estabelecimento</p>
    <h1>Planos TOP BARBER</h1>
    <p className="intro">Escolha Pro, Premium ou Unlimited e pague por Pix, na modalidade mensal ou anual.
      {prices?.trial_days ? ` O teste de ${prices.trial_days} dias dispensa cartão.` : ""}</p>
    {!prices && <p role="alert">Os preços estão temporariamente indisponíveis.</p>}
    {prices && <PlanCatalog prices={prices} />}
    <div className="account-links"><Link className="primary" href="/cadastro">Começar grátis por 7 dias</Link>
      <Link className="secondary" href="/painel">Acessar meu painel</Link></div>
  </section>;
}
