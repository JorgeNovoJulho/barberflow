"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { subscriptionProofBucket } from "../../../../lib/subscription-checkout";
import { isPlanPeriod } from "../../../../lib/subscriptions";
import { supabaseServer } from "../../../../lib/supabase";

async function subscriptionContext(shop: string) {
  if (!isUuid(shop)) redirect("/painel");
  const path = `/painel/${shop}/assinatura`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  return { supabase, path };
}

export async function preferPlan(shop: string, form: FormData) {
  const { supabase, path } = await subscriptionContext(shop);
  const period = form.get("period");
  if (!isPlanPeriod(period)) redirect(path + "?estado=falha");
  const { data, error } = await supabase.rpc("barberflow_prefer_plan", { shop, selected_period: period });
  redirect(path + "?estado=" + (error || !data ? "falha" : "salvo"));
}

export async function issueSubscriptionPix(shop: string, period: string) {
  const { supabase, path } = await subscriptionContext(shop);
  if (!isPlanPeriod(period)) redirect(path + "?estado=pix-falha");
  const { data, error } = await supabase.rpc("barberflow_issue_subscription_pix", { shop, selected_period: period });
  redirect(path + (error || !data ? "?estado=pix-falha" : "#pix-" + data));
}

export async function sendSubscriptionProof(shop: string, charge: string, form: FormData) {
  const { supabase, path } = await subscriptionContext(shop);
  if (!isUuid(charge)) redirect(path + "?estado=envio-falha");
  const file = form.get("proof");
  const extensions: Record<string, string> = {
    "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  };
  if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024 || !Object.hasOwn(extensions, file.type)) {
    redirect(path + "?estado=arquivo-invalido#pix-" + charge);
  }
  const objectPath = `${shop}/${charge}/${randomUUID()}.${extensions[file.type]}`;
  const { error: uploadError } = await supabase.storage.from(subscriptionProofBucket).upload(objectPath, file);
  if (uploadError) redirect(path + "?estado=envio-falha#pix-" + charge);
  const { data, error } = await supabase.rpc("barberflow_submit_subscription_proof", { shop, charge, object_path: objectPath });
  redirect(path + "?estado=" + (error || !data ? "envio-falha" : "enviado") + "#pix-" + charge);
}
