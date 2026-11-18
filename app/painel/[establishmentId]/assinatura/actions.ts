"use server";

import { storeSubscriptionProof } from "../../../../lib/subscription-proof";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { isPlanPeriod, isPlanTier } from "../../../../lib/subscriptions";
import { supabaseServer } from "../../../../lib/supabase";

async function subscriptionContext(shop: string) {
  if (!isUuid(shop)) redirect("/painel");
  const path = `/painel/${shop}/assinatura`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  return { supabase, path };
}

export async function issueSubscriptionPix(shop: string, form: FormData) {
  const { supabase, path } = await subscriptionContext(shop);
  const [tier, period] = String(form.get("option") ?? "").split(":");
  if (!isPlanTier(tier) || !isPlanPeriod(period)) redirect(path + "?estado=pix-falha");
  const { data, error } = await supabase.rpc("barberflow_issue_subscription_pix", {
    shop, selected_period: period, selected_plan: tier,
  });
  if (error || !data) redirect(path + "?estado=pix-falha");
  redirect(path + "?cobranca=" + data + "#pix-" + data);
}

export async function sendSubscriptionProof(shop: string, charge: string, form: FormData) {
  const { supabase, path } = await subscriptionContext(shop);
  if (!isUuid(charge)) redirect(path + "?estado=envio-falha");
  const status = await storeSubscriptionProof(supabase, shop, charge, form.get("proof"));
  redirect(path + "?estado=" + status + (status === "arquivo-invalido" ? "&comprovante=" + charge : "") + "#pix-" + charge);
}
