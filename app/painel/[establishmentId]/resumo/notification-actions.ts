"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";

export async function markBookingNotifications(shop: string, asOf: string, period: number, clear = false) {
  if (!isUuid(shop)) redirect("/painel");
  const path = `/painel/${shop}/resumo`;
  const query = new URLSearchParams({ periodo: String(period), notificacoes: "1" });
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  if (!Number.isFinite(Date.parse(asOf))) redirect(path);
  const { error } = await supabase.rpc(clear ? "barberflow_clear_booking_notifications" : "barberflow_read_booking_notifications", { shop, seen_until: asOf });
  if (error) query.set("aviso", "falha");
  revalidatePath(path);
  redirect(path + "?" + query + "#notificacoes");
}
