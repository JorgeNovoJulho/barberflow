"use server";

import { redirect } from "next/navigation";
import { requireMaster } from "../../../lib/master";
import { isUuid } from "../../../lib/establishments";

const path = "/gestao-master/financeiro";

export async function controlSubscription(shop: string, form: FormData) {
  const supabase = await requireMaster(path);
  const operation = String(form.get("operation") ?? "");
  const days = operation === "bonus" ? Number(form.get("days")) : null;
  const reason = String(form.get("reason") ?? "").trim();
  const query = new URLSearchParams({ busca: shop, estado: "falha" });
  if (isUuid(shop) && ["normal","frozen","blocked","bonus"].includes(operation)
    && (days === null || (Number.isInteger(days) && days >= 1 && days <= 365))
    && reason.length >= 3 && reason.length <= 400) {
    const { data } = await supabase.rpc("barberflow_master_subscription_control", { shop, operation, days, reason });
    if (data === true) query.set("estado", "salvo");
  }
  redirect(path + "?" + query);
}
