export const marginTypes = [
  { id: "alta", label: "Alta", min: 100, max: 400 },
  { id: "media", label: "Média", min: 50, max: 99 },
  { id: "baixa", label: "Baixa", min: 10, max: 49 },
] as const;
export type MarginTier = typeof marginTypes[number]["id"];
export type Margins = Record<MarginTier, number>;
export const defaultMargins: Margins = { alta: 100, media: 50, baixa: 10 };
export const bundleSizes = [3, 5, 10] as const;
export const markedUp = (cents: number, rate: number) => Math.round(cents * (100 + rate) / 100);
export const priceInput = (cents: number | null | undefined) => cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
export const formatStockPrice = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export function parseMarkup(value: string) {
  return /^\d{1,3}$/.test(value) && Number(value) <= 400 ? Number(value) : null;
}

export function markupTier(rate: number): MarginTier {
  return rate >= 100 ? "alta" : rate >= 50 ? "media" : "baixa";
}
