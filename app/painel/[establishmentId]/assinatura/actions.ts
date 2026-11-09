"use server";

import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { isPlanPeriod } from "../../../../lib/subscriptions";
import { supabaseServer } from "../../../../lib/supabase";

export async function preferPlan(shop: string, form: FormData) {
  if (!isUuid(shop)) redirect("/painel");
  const path = `/painel/${shop}/assinatura`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  const period = form.get("period");
  if (!isPlanPeriod(period)) redirect(path + "?estado=falha");
  const { data, error } = await supabase.rpc("barberflow_prefer_plan", { shop, selected_period: period });
  redirect(path + "?estado=" + (error || !data ? "falha" : "salvo"));
}
