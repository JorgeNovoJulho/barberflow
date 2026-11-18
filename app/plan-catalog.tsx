"use client";

import { useState } from "react";
import Link from "next/link";
import { planNames, planPrice, planTiers, tiers, type PlanPrices, type PlanPeriod } from "../lib/subscriptions";

export function PlanCatalog({ prices }: { prices: PlanPrices }) {
  const [period, setPeriod] = useState<PlanPeriod>("monthly");
  return <>
    <div className="account-links finance-tabs" role="group" aria-label="Período da assinatura">
      {(["monthly", "yearly"] as const).map(value => <button type="button" key={value}
        className="secondary finance-tab" data-tone={value === "monthly" ? "blue" : "purple"}
        aria-pressed={period === value} onClick={() => setPeriod(value)}>{planNames[value]}</button>)}
    </div>
    <div className="subscription-plans">
      {tiers.map(tier => <article key={tier} className="card subscription-plan" data-tier={tier}>
        <h3>{planTiers[tier].name}</h3>
        <p className="plan-catalog-price">{planPrice(prices, tier, period)} <small>/{period === "monthly" ? "mês" : "ano"}</small></p>
        <ul>{planTiers[tier].limits.map(limit => <li key={limit}>{limit}</li>)}</ul>
        <Link className="primary" href="/cadastro">Começar com {planTiers[tier].name}</Link>
      </article>)}
    </div>
  </>;
}
