"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid, parsePrice } from "../../../lib/establishments";
import { requireMaster } from "../../../lib/master";
import { normalizePixKey, pixLabel } from "../../../lib/pix";
import { isPlanPeriod, isPlanTier } from "../../../lib/subscriptions";

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
  const premium_monthly_cents = parsePrice(value(form, "premiumMonthly"));
  const premium_yearly_cents = parsePrice(value(form, "premiumYearly"));
  const trial = value(form, "trial");
  const trial_days = Number(trial);
  const rawPix = value(form, "pix");
  const pix_key = rawPix ? normalizePixKey(rawPix) : "";
  const pix_city = pixLabel(value(form, "city"), 15);
  const grace = value(form, "grace");
  const grace_days = Number(grace);
  const billing_rules = value(form, "rules");
  const plan_benefits = value(form, "benefits");
  const pix_beneficiary = value(form, "beneficiary");
  const pix_merchant = pixLabel(pix_beneficiary, 25);
  if (rawPix && (!pix_key || !pix_merchant || !pix_city)) finish("pix-invalido");
  if (!/^\d{1,2}$/.test(grace) || grace_days > 30 || billing_rules.length > 2500 || plan_benefits.length > 2500) finish("invalido");
  const support_whatsapp = value(form, "whatsapp").replace(/[\s()+.-]/g, "");
  if (pix_beneficiary.length > 120 || !/^([1-9]\d{9,14})?$/.test(support_whatsapp)) finish("invalido");
  const instructions = value(form, "instructions");
  if (!monthly_cents || !yearly_cents || !premium_monthly_cents || !premium_yearly_cents || !/^\d{1,3}$/.test(trial) || trial_days > 365 || instructions.length > 1500) finish("invalido");
  const { data, error } = await supabase.from("barberflow_plan_settings")
    .update({ monthly_cents, yearly_cents, premium_monthly_cents, premium_yearly_cents, trial_days, pix_key, instructions, pix_beneficiary, support_whatsapp,
      pix_city, pix_merchant, grace_days, billing_rules, plan_benefits }).eq("singleton", true).select("singleton").maybeSingle();
  revalidatePath("/planos");
  finish(error || !data ? "falha" : "configurado");
}

export async function confirmSubscriptionPayment(shop: string, form: FormData) {
  const supabase = await requireMaster();
  if (!isUuid(shop)) finish("invalido");
  const period = form.get("period");
  const plan = form.get("plan");
  const cents = parsePrice(value(form, "amount"));
  const reference = value(form, "reference");
  if (!isPlanPeriod(period) || !isPlanTier(plan) || !cents || !reference || reference.length > 160) finish("invalido", shop);
  const { data, error } = await supabase.rpc("barberflow_confirm_subscription_payment", {
    shop, paid_period: period, cents, payment_reference: reference, paid_plan: plan,
  });
  revalidatePath(`/painel/${shop}/assinatura`);
  finish(error ? "falha" : data ? "confirmado" : "duplicado", shop);
}

export async function reviewSubscriptionPix(shop: string, charge: string, reject: boolean, form: FormData) {
  const supabase = await requireMaster();
  if (!isUuid(shop) || !isUuid(charge)) finish("invalido");
  const received_cents = reject ? null : parsePrice(value(form, "amount"));
  const reference = reject ? null : value(form, "reference");
  const reason = reject ? value(form, "reason") : null;
  if (reject ? !reason || reason.length > 500 : !received_cents || !reference || reference.length > 160) finish("invalido", shop);
  const { data, error } = await supabase.rpc("barberflow_review_subscription_pix", { charge, received_cents, reference, reason });
  revalidatePath(`/painel/${shop}/assinatura`);
  finish(error || !data ? "revisao-falhou" : reject ? "recusado" : "confirmado", shop);
}

export async function setPaymentControl(form: FormData) {
  const supabase = await requireMaster();
  const setting = form.get("payment-control");
  if (setting !== "pause" && setting !== "resume") finish("invalido");
  const { data, error } = await supabase.rpc("barberflow_set_payment_control", {
    allow_payments: setting === "resume",
  });
  if (error || !data) finish("falha");
  revalidatePath(path);
  finish("controle-atualizado");
}
