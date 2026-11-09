"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid, parsePrice } from "../../../lib/establishments";
import { requireMaster } from "../../../lib/master";
import { isPlanPeriod } from "../../../lib/subscriptions";

const path = "/gestao-master/assinaturas";
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function finish(status: string, shop?: string): never {
  const query = new URLSearchParams({ estado: status });
  if (shop) query.set("busca", shop);
  redirect(path + "?" + query);
}

export async function savePlanSettings(form: FormData) {
  const supabase = await requireMaster();
  const monthly_cents = parsePrice(value(form, "monthly"));
  const yearly_cents = parsePrice(value(form, "yearly"));
  const trial = value(form, "trial");
  const trial_days = Number(trial);
  const pix_key = value(form, "pix");
  const pix_beneficiary = value(form, "beneficiary");
  const support_whatsapp = value(form, "whatsapp").replace(/[\s()+.-]/g, "");
  if (pix_beneficiary.length > 120 || !/^([1-9]\d{9,14})?$/.test(support_whatsapp)) finish("invalido");
  const instructions = value(form, "instructions");
  if (!monthly_cents || !yearly_cents || !/^\d{1,3}$/.test(trial) || trial_days > 365 || pix_key.length > 160 || instructions.length > 1500) finish("invalido");
  const { data, error } = await supabase.from("barberflow_plan_settings")
    .update({ monthly_cents, yearly_cents, trial_days, pix_key, instructions, pix_beneficiary, support_whatsapp }).eq("singleton", true).select("singleton").maybeSingle();
  revalidatePath("/planos");
  finish(error || !data ? "falha" : "configurado");
}

export async function confirmSubscriptionPayment(shop: string, form: FormData) {
  const supabase = await requireMaster();
  if (!isUuid(shop)) finish("invalido");
  const period = form.get("period");
  const cents = parsePrice(value(form, "amount"));
  const reference = value(form, "reference");
  if (!isPlanPeriod(period) || !cents || !reference || reference.length > 160) finish("invalido", shop);
  const { data, error } = await supabase.rpc("barberflow_confirm_subscription_payment", {
    shop, paid_period: period, cents, payment_reference: reference,
  });
  revalidatePath(`/painel/${shop}/assinatura`);
  finish(error ? "falha" : data ? "confirmado" : "duplicado", shop);
}
