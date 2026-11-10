export type ShowcaseProduct = {
  id: string;
  shop_id: string;
  sku: string;
  total_count: number;
  name: string;
  description: string;
  price_cents: number;
  available: number;
  bundle_units: number | null;
  bundle_cents: number | null;
  pix_enabled: boolean;
};

export function showcaseTotal(product: ShowcaseProduct, units: number) {
  if (!product.bundle_units || product.bundle_cents === null) return product.price_cents * units;
  return Math.floor(units / product.bundle_units) * product.bundle_cents
    + units % product.bundle_units * product.price_cents;
}

export const showcaseStatus = {
  pending: "Aguardando confirmação do Pix",
  paid: "Pago · em separação",
  ready: "Pronto para retirada",
  collected: "Retirado",
};

export function showcaseOrderNumber(id: string) {
  return id.toUpperCase();
}

export function formatShowcaseDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
    .format(new Date(value));
}
