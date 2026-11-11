"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../lib/establishments";
import { validDay } from "../../../lib/agenda";
import { supabaseServer } from "../../../lib/supabase";

export async function cancelAppointment(shop: string, entry: string, day: string, overview: boolean, form: FormData) {
  if (!isUuid(shop) || !isUuid(entry) || !validDay(day)) redirect("/painel");
  const reason = String(form.get("reason") ?? "").trim();
  const base = `/painel/${shop}`;
  const path = overview ? base + "/resumo?" : base + "/agenda?dia=" + day + "&";
  const supabase = await supabaseServer();
  const result = reason && reason.length <= 500
    ? await supabase?.rpc("barberflow_cancel_appointment", { shop, entry, reason }) : null;
  if (result?.data) {
    revalidatePath(base + "/agenda");
    revalidatePath(base + "/resumo");
    revalidatePath("/cliente");
    revalidatePath("/meus-agendamentos");
  }
  redirect(path + "cancelamento=" + (result?.data ? "confirmado" : "falhou") + (overview ? "#proximos-atendimentos" : ""));
}
