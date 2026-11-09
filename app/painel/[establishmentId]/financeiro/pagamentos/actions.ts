"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../../lib/establishments";
import { normalizePixKey, pixLabel } from "../../../../../lib/pix";
import { supabaseServer } from "../../../../../lib/supabase";
import { cardAdmin, createCardCheckout, findCardPayment, mercadoPagoCollector, openCardToken, sealCardToken,
  type CardCharge } from "../../../../../lib/card-payments";

async function paymentContext(shop: string, receipt?: string) {
  if (!isUuid(shop) || (receipt && !isUuid(receipt))) redirect("/painel");
  const finance = `/painel/${shop}/financeiro`;
  const path = receipt ? `/painel/${shop}/comanda/${receipt}` : finance + "/pagamentos";
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  const access = await supabase.rpc("barberflow_finance_status", { shop });
  if (access.error || access.data !== "unlocked") redirect(finance);
  return { supabase, finish(state: string): never {
    revalidatePath(path);
    redirect(path + "?pagamento=" + state + "#recebimento");
  } };
}

export async function saveBusinessPix(shop: string, remove: boolean, form: FormData) {
  const { supabase, finish } = await paymentContext(shop);
  const key = normalizePixKey(String(form.get("key") ?? ""));
  const merchant = pixLabel(String(form.get("merchant") ?? ""), 25);
  const city = pixLabel(String(form.get("city") ?? ""), 15);
  if (!remove && (!key || !merchant || !city)) return finish("dados");
  const { data, error } = await supabase.rpc("barberflow_save_business_pix", {
    shop, key_value: remove ? null : key, merchant_name: merchant, merchant_city: city,
  });
  finish(error || !data ? "falha" : remove ? "pix-removido" : "pix-salvo");
}

export async function saveCardAccount(shop: string, remove: boolean, form: FormData) {
  const { finish } = await paymentContext(shop);
  const admin = cardAdmin();
  if (!admin) return finish("ambiente");
  const token = String(form.get("token") ?? "").trim();
  const sandbox = form.get("mode") === "test";
  let collector: number | null = null;
  let ciphertext: string | null = null;
  if (!remove) {
    if (!/^[A-Za-z0-9_-]{20,300}$/.test(token) || (!sandbox && token.startsWith("TEST-"))) return finish("dados");
    try {
      collector = await mercadoPagoCollector(token);
      ciphertext = sealCardToken(shop, token);
    } catch {
      return finish("credencial");
    }
  }
  const { error } = await admin.rpc("barberflow_set_card_account", { shop, ciphertext, collector, test_mode: sandbox });
  finish(error ? "falha" : remove ? "cartao-removido" : "cartao-salvo");
}

export async function cardCheckout(shop: string, receipt: string) {
  const { finish } = await paymentContext(shop, receipt);
  const admin = cardAdmin();
  if (!admin) return finish("ambiente");
  const result = await admin.rpc("barberflow_begin_card_charge", { shop, receipt });
  const charge = result.data as CardCharge | null;
  if (result.error || !charge) return finish("indisponivel");
  if (Date.parse(charge.expires_at) <= Date.now()) return finish("consultar");
  if (charge.checkout_url) return finish("link");
  let url: string;
  try {
    url = await createCardCheckout(openCardToken(shop, charge.sealed_token), charge);
  } catch {
    return finish("provedor");
  }
  const { error, data } = await admin.rpc("barberflow_publish_card_charge", { charge_id: charge.id, url_value: url });
  finish(error || !data ? "indisponivel" : "link");
}

export async function syncCardCheckout(shop: string, receipt: string) {
  const { finish } = await paymentContext(shop, receipt);
  const admin = cardAdmin();
  if (!admin) return finish("ambiente");
  const result = await admin.rpc("barberflow_card_charge", { shop, receipt });
  const charge = result.data as CardCharge | null;
  if (result.error || !charge) return finish("indisponivel");
  let payment: string | null;
  try {
    payment = await findCardPayment(openCardToken(shop, charge.sealed_token), charge);
  } catch {
    return finish("provedor");
  }
  if (payment === "review") return finish("revisar");
  const { data, error } = await admin.rpc("barberflow_finish_card_charge", { charge_id: charge.id, provider_payment: payment });
  finish(error ? "falha" : data === "paid" ? "confirmado" : data === "tested" ? "testado" : data === "expired" ? "expirado"
    : data === "review" ? "revisar" : "aguardando");
}
