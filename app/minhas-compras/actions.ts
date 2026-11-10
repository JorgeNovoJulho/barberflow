"use server";

import { redirect } from "next/navigation";
import { isUuid } from "../../lib/establishments";
import { supabaseServer } from "../../lib/supabase";
import { issueShowcasePix } from "../../lib/showcase-asaas";

export async function generatePurchasePix(id: string) {
  if (!isUuid(id)) redirect("/minhas-compras");
  const path = "/minhas-compras?pedido=" + id;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user?.email_confirmed_at || user.is_anonymous) redirect("/login?" + new URLSearchParams({ next: path }));
  const { data } = await supabase.from("barberflow_showcase_orders")
    .select("id,establishment_id,expires_at,total_cents,pix_key")
    .eq("id", id).eq("buyer_id", user.id).eq("status", "pending").eq("asaas_pix", true).maybeSingle();
  const issued = data && await issueShowcasePix(data);
  redirect(path + (issued ? "" : "&pix=aguarde") + "#pedido-" + id);
}
