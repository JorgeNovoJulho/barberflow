"use server";

import QRCode from "qrcode";
import { isUuid } from "../lib/establishments";
import { validDay } from "../lib/agenda";
import { isPlanTier, isPlanPeriod } from "../lib/subscriptions";
import { showcasePix } from "../lib/pix";
import { storeSubscriptionProof } from "../lib/subscription-proof";
import { supabaseServer } from "../lib/supabase";

type LimitStatus = {
  plan: string; owner: boolean; promoter: boolean;
  limits: Record<string, number | null>;
  professional_count: number; product_count: number; service_count: number; appointment_count: number;
};

export async function upgradeContext(shop: string) {
  if (!isUuid(shop)) return null;
  const client = await supabaseServer();
  if (!client || !(await client.auth.getUser()).data.user) return null;
  const [status, prices] = await Promise.all([
    client.rpc("barberflow_plan_limit_status", { shop }),
    client.from("barberflow_plan_settings").select("monthly_cents,yearly_cents,premium_monthly_cents,premium_yearly_cents,unlimited_monthly_cents,unlimited_yearly_cents").single(),
  ]);
  if (!status.data || prices.error || !prices.data) return null;
  if (status.data.owner && status.data.promoter) {
    const access = await client.rpc("barberflow_subscription_status", { shop });
    if (access.data?.promoter_half) prices.data.premium_monthly_cents = Math.ceil(prices.data.premium_monthly_cents / 2);
  }
  return { status: status.data as LimitStatus, prices: prices.data };
}

export async function checkPlanLimit(shop: string, resource: string, form: FormData) {
  if (!isUuid(shop) || !["professionals", "products", "services", "appointments"].includes(resource)) return null;
  const client = await supabaseServer();
  if (!client || !(await client.auth.getUser()).data.user) return null;
  const date = String(form.get("day") ?? form.get("date") ?? "");
  const { data } = await client.rpc("barberflow_plan_limit_status", {
    shop, booking_day: validDay(date) ? date : null,
  });
  const status = data as LimitStatus | null;
  if (!status) return null;
  const quota = status.limits[resource];
  if (quota === null) return null;
  let count = resource === "professionals" ? status.professional_count
    : resource === "products" ? status.product_count : status.appointment_count;
  if (resource === "products" && form.get("showcase") !== "on") return null;
  if (resource === "services") {
    const person = String(form.get("quota_person") ?? "");
    if (isUuid(person)) {
      count = form.getAll("service").length;
      if (count <= quota) return null;
    } else {
      const service = String(form.get("quota_service") ?? "");
      if (!isUuid(service)) return null;
      const chosen = form.getAll("professional").map(String);
      if (!chosen.length || chosen.some(id => !isUuid(id))) return null;
      for (const professional of chosen) {
        const response = await client.rpc("barberflow_plan_limit_status", { shop, person: professional });
        if (!response.data) continue;
        const assignments = await client.rpc("barberflow_team_service_assignments", { shop });
        const linked = assignments.data?.links?.some((link: { professional_id: string; service_id: string }) => link.professional_id === professional && link.service_id === service);
        if (!linked && response.data.service_count >= quota) {
          return `O plano atingiu o limite de ${quota} serviços por profissional.`;
        }
      }
      return null;
    }
  }
  if (count < quota) return null;
  const labels: Record<string, string> = { professionals: "profissionais ativos", products: "produtos ativos na vitrine", services: "serviços por profissional", appointments: "agendamentos por dia" };
  return `O plano atingiu o limite de ${quota} ${labels[resource]}.`;
}

export async function createUpgradeCharge(shop: string, plan: string, period: string) {
  const context = await upgradeContext(shop);
  if (!context?.status.owner || !isPlanTier(plan) || !isPlanPeriod(period)) return { error: "O proprietário precisa solicitar a alteração do plano." };
  const ranks: Record<string, number> = { pro: 1, premium: 2, unlimited: 3 };
  if ((ranks[plan] ?? 0) <= (ranks[context.status.plan] ?? 0)) return { error: "Escolha um plano superior ao atual." };
  if (context.status.promoter && (plan !== "premium" || period !== "monthly")) return { error: "Esta conta usa as condições mensais do plano Premium para divulgadores." };
  const client = (await supabaseServer())!;
  if ((await client.rpc("barberflow_subscription_pix_ready")).data !== true) return { error: "O Pix de assinaturas está temporariamente indisponível. Entre em contato com o suporte." };
  const { data, error } = await client.rpc("barberflow_issue_subscription_pix", { shop, selected_period: period, selected_plan: plan });
  if (error || typeof data !== "string") return { error: "Não foi possível gerar a cobrança." };
  return loadUpgradeCharge(shop, data);
}

export async function loadUpgradeCharge(shop: string, charge: string) {
  if (!isUuid(shop) || !isUuid(charge)) return { error: "Cobrança inválida." };
  const client = await supabaseServer();
  const user = client && (await client.auth.getUser()).data.user;
  if (!client || !user) return { error: "Entre novamente para consultar a cobrança." };
  const business = await client.from("barberflow_establishments").select("id").eq("id",shop).eq("owner_id",user.id).maybeSingle();
  if (!business.data) return { error: "Somente o proprietário pode consultar a cobrança." };
  const { data, error } = await client.from("barberflow_subscription_charges")
    .select("id,status,plan,period,amount_cents,pix_key,merchant,city,rejection_reason").eq("establishment_id",shop).eq("id",charge).maybeSingle();
  if (error || !data) return { error: "Cobrança não encontrada." };
  const code = data.status === "pending" ? showcasePix({ ...data, total_cents: data.amount_cents }) : null;
  const qr = code ? await QRCode.toDataURL(code, { width: 256, margin: 4, errorCorrectionLevel: "M" }) : null;
  return { charge: { id: data.id as string, status: data.status as string, plan: data.plan as string, period: data.period as string, amount: data.amount_cents as number,
    reason: data.rejection_reason as string | null, code, qr } };
}

export async function uploadUpgradeProof(shop: string, charge: string, form: FormData) {
  const current = await loadUpgradeCharge(shop,charge);
  if (!current.charge || !["pending", "submitted"].includes(current.charge.status)) return { error: "Esta cobrança não está aguardando comprovante." };
  const client = (await supabaseServer())!;
  const status = await storeSubscriptionProof(client,shop,charge,form.get("proof"));
  return status === "enviado" ? loadUpgradeCharge(shop,charge) : { error: status === "arquivo-invalido" ? "Envie PDF, JPG, PNG, BMP ou WebP de até 5 MB." : "Não foi possível enviar o comprovante." };
}
