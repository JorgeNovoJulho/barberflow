"use server";

import { redirect } from "next/navigation";
import { isUuid } from "../../../lib/establishments";
import { slugPattern } from "../../../lib/public-booking";
import { issueShowcasePix } from "../../../lib/showcase-asaas";
import { supabaseServer } from "../../../lib/supabase";

export async function placeShowcaseOrder(slug: string, item: string, form: FormData) {
  const requestId = String(form.get("requestId") ?? "");
  if (!slugPattern.test(slug) || !isUuid(item) || !isUuid(requestId)) redirect("/estabelecimentos");
  const path = `/estabelecimento/${slug}`;
  const finish = (status: string): never => redirect(`${path}?vitrine=${status}#vitrine`);
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path }));
  if (!user.email_confirmed_at || user.is_anonymous) finish("conta");
  const units = Number(form.get("units"));
  const amount = Number(form.get("quoted"));
  if (!Number.isInteger(units) || units < 1 || units > 100 || !Number.isInteger(amount) || amount < 1 || amount > 99999999) finish("invalido");
  const { data, error } = await supabase.rpc("barberflow_place_showcase_order", {
    profile_slug: slug, item, units, request_id: requestId, quoted_cents: amount,
  });
  if (error || typeof data !== "string" || !isUuid(data)) {
    return finish(error?.code === "42501" ? "conta" : error?.details === "limit" ? "limite" : error?.details === "price" ? "preco" : "indisponivel");
  }
  const integrated = await supabase.from("barberflow_showcase_orders")
    .select("id,establishment_id,expires_at,total_cents,pix_key").eq("id", data)
    .eq("buyer_id", user.id).eq("status", "pending").eq("asaas_pix", true).maybeSingle();
  if (integrated.data) await issueShowcasePix(integrated.data);
  redirect(`/minhas-compras?pedido=${data}`);
}
