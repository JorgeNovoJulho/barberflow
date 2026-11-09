import { bookingCurrency } from "./public-booking";

export const planNames = { monthly: "Mensal", yearly: "Anual" } as const;
export type PlanPeriod = keyof typeof planNames;
export type PlanPrices = { monthly_cents: number; yearly_cents: number; trial_days: number };

export function isPlanPeriod(value: unknown): value is PlanPeriod {
  return value === "monthly" || value === "yearly";
}

export function planPrice(prices: PlanPrices, period: PlanPeriod) {
  return bookingCurrency.format((period === "monthly" ? prices.monthly_cents : prices.yearly_cents) / 100);
}
