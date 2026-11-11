import { bookingCurrency } from "./currency";

export const planNames = { monthly: "Mensal", yearly: "Anual" } as const;
export type PlanPeriod = keyof typeof planNames;
export const planTiers = {
  pro: { name: "Pro", limits: ["Até 2 profissionais ativos", "Até 2 serviços vinculados por profissional", "Até 8 agendamentos por dia", "Até 20 produtos ativos na vitrine"] },
  premium: { name: "Premium", limits: ["Profissionais ilimitados", "Serviços vinculados ilimitados", "Agendamentos ilimitados", "Até 100 produtos ativos na vitrine"] },
} as const;
export type PlanTier = keyof typeof planTiers;
export const tiers = ["pro", "premium"] as const;
export const periods = ["monthly", "yearly"] as const;
export type PlanPrices = {
  monthly_cents: number; yearly_cents: number; premium_monthly_cents: number; premium_yearly_cents: number;
};

export function isPlanTier(value: unknown): value is PlanTier {
  return value === "pro" || value === "premium";
}

export function isPlanPeriod(value: unknown): value is PlanPeriod {
  return value === "monthly" || value === "yearly";
}

export function tierLabel(value: unknown) {
  return isPlanTier(value) ? planTiers[value].name : "Plano anterior";
}

export function planPrice(prices: PlanPrices, tier: PlanTier, period: PlanPeriod) {
  const cents = tier === "premium"
    ? (period === "monthly" ? prices.premium_monthly_cents : prices.premium_yearly_cents)
    : (period === "monthly" ? prices.monthly_cents : prices.yearly_cents);
  return bookingCurrency.format(cents / 100);
}
