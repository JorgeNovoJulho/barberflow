"use server";

import { redirect } from "next/navigation";
import { validDay } from "../../lib/agenda";
import { isUuid } from "../../lib/establishments";
import { supabaseServer } from "../../lib/supabase";

export async function submitReview(entry: string, form: FormData) {
  const base = "/meus-agendamentos";
  const stars = Number(form.get("stars"));
  const message = String(form.get("message") ?? "").trim();
  if (!isUuid(entry) || !Number.isInteger(stars) || stars < 1 || stars > 5 || message.length > 500) {
    redirect(base + "?estado=avaliacao-invalida");
  }
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?next=%2Fmeus-agendamentos");
  const { data, error } = await supabase.rpc("barberflow_submit_review", { entry, stars, message });
  redirect(base + "?estado=" + (!error && data === true ? "avaliado" : "avaliacao-invalida"));
}

export async function changeBooking(entry: string, targetDay: string | null, form: FormData) {
  const base = "/meus-agendamentos";
  if (!isUuid(entry)) redirect(base + "?estado=indisponivel");
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?next=%2Fmeus-agendamentos");
  const slot = String(form.get("slot") ?? "");
  if (targetDay && (!validDay(targetDay) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot))) {
    redirect(base + "?estado=indisponivel");
  }
  const { data, error } = await supabase.rpc("barberflow_customer_booking_change", {
    entry, new_start: targetDay ? targetDay + "T" + slot : null,
  });
  const state = error || !data ? "indisponivel" : targetDay ? "remarcado" : "cancelado";
  redirect(base + "?estado=" + state);
}
