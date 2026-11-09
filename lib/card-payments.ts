import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./supabase";

function paymentKey() {
  const hex = process.env.BARBERFLOW_PAYMENT_SECRET ?? "";
  return /^[a-f0-9]{64}$/i.test(hex) ? Buffer.from(hex, "hex") : null;
}

export function cardAdmin() {
  const config = supabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return config && key && paymentKey()
    ? createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export function sealCardToken(shop: string, token: string) {
  const key = paymentKey();
  if (!key) throw new Error("Payment encryption unavailable");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(shop));
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openCardToken(shop: string, encrypted: string) {
  const key = paymentKey();
  if (!key) throw new Error("Payment encryption unavailable");
  const data = Buffer.from(encrypted, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  cipher.setAAD(Buffer.from(shop));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8");
}

export type CardCharge = {
  id: string; amount: number; collector_id: number; sandbox: boolean;
  sealed_token: string; checkout_url: string | null; expires_at: string;
};

async function mercadoPago<T>(token: string, path: string, body?: unknown) {
  const response = await fetch("https://api.mercadopago.com" + path, {
    method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error("Mercado Pago request failed");
  return await response.json() as T;
}

export async function mercadoPagoCollector(token: string) {
  const account = await mercadoPago<{ id: number; site_id: string }>(token, "/users/me");
  if (!Number.isSafeInteger(account.id) || account.id < 1 || account.site_id !== "MLB") throw new Error("Invalid merchant");
  return account.id;
}

export function isMercadoPagoCheckout(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["www.mercadopago.com.br", "www.mercadopago.com", "sandbox.mercadopago.com", "sandbox.mercadopago.com.br"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function createCardCheckout(token: string, charge: CardCharge) {
  const preference = await mercadoPago<{ init_point?: string; sandbox_init_point?: string }>(token, "/checkout/preferences", {
    items: [{ id: charge.id, title: "Comanda BARBERFLOW", quantity: 1, currency_id: "BRL", unit_price: charge.amount / 100 }],
    external_reference: charge.id,
    binary_mode: true,
    expires: true,
    expiration_date_to: new Date(charge.expires_at).toISOString(),
    payment_methods: {
      excluded_payment_types: ["bank_transfer", "ticket", "atm", "prepaid_card", "consumer_credits"].map((id) => ({ id })),
    },
  });
  const url = charge.sandbox ? preference.sandbox_init_point : preference.init_point;
  if (!url || !isMercadoPagoCheckout(url)) throw new Error("Unexpected checkout URL");
  return url;
}

type ProviderPayment = {
  id: number; collector_id: number; live_mode: boolean; status: string; currency_id: string;
  external_reference: string; transaction_amount: number; transaction_amount_refunded: number; payment_type_id: string;
};

export async function findCardPayment(token: string, charge: CardCharge) {
  const query = new URLSearchParams({ external_reference: charge.id, limit: "25" });
  const result = await mercadoPago<{ results: ProviderPayment[]; paging: { total: number } }>(token, "/v1/payments/search?" + query);
  if (!Array.isArray(result.results) || !Number.isSafeInteger(result.paging?.total) || result.paging.total > result.results.length) return "review";
  const unresolved = result.results.filter((payment) => !["rejected", "cancelled"].includes(payment.status));
  if (!unresolved.length) return null;
  const [candidate] = unresolved;
  if (unresolved.length !== 1 || !Number.isSafeInteger(candidate.id) || candidate.id < 1) return "review";
  const payment = await mercadoPago<ProviderPayment>(token, "/v1/payments/" + candidate.id);
  if (payment.id !== candidate.id
    || payment.external_reference !== charge.id || payment.collector_id !== charge.collector_id
    || payment.live_mode !== !charge.sandbox || payment.status !== "approved" || payment.currency_id !== "BRL"
    || Math.round(payment.transaction_amount * 100) !== charge.amount || payment.transaction_amount_refunded !== 0
    || !["credit_card", "debit_card"].includes(payment.payment_type_id)) return "review";
  return String(payment.id);
}
