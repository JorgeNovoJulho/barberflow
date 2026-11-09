import type { Metadata } from "next";
import { planNames, planPrice, type PlanPeriod } from "../../lib/subscriptions";
import { supabaseServer } from "../../lib/supabase";

export const metadata: Metadata = { title: "Planos" };

export default async function Plans() {
  const supabase = await supabaseServer();
  const settings = await supabase?.from("barberflow_plan_settings").select("monthly_cents,yearly_cents,trial_days").single();
  const prices = settings?.data;
  return (
    <section className="container section">
      <p className="eyebrow">Assinatura por estabelecimento</p>
      <h1>Planos BARBERFLOW</h1>
      <p className="intro">Os dois períodos incluem as mesmas funcionalidades.{prices?.trial_days ? ` O teste de ${prices.trial_days} dias dispensa cartão.` : ""}</p>
      {!prices && <p role="alert">Os preços estão temporariamente indisponíveis.</p>}
      <div className="cards">
        {(Object.keys(planNames) as PlanPeriod[]).map((period) => (
          <article key={period} className="card">
            <h2>{planNames[period]}</h2>
            {prices && <p><strong className="price">{planPrice(prices, period)}</strong> {period === "monthly" ? "por mês" : "por ano"}</p>}
            <ul>
              <li>Agenda por profissional</li>
              <li>Equipe, serviços e página pública</li>
              <li>Marketplace e gestão de clientes</li>
              <li>Fidelidade e relatórios financeiros</li>
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
