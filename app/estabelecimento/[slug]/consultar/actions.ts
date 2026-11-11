"use server";

import { cookies } from "next/headers";
import { validDay } from "../../../../lib/agenda";
import { isUuid } from "../../../../lib/establishments";
import { slugPattern } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import type { GuestState } from "./guest-form";

export async function manageGuest(slug: string, _: GuestState, form: FormData): Promise<GuestState> {
  if (!slugPattern.test(slug)) return { message: "Estabelecimento indisponível." };
  const customer = String(form.get("customer") ?? "").trim();
  const phone = String(form.get("phone") ?? "").replace(/\D/g, "");
  const token = String(form.get("code") || (await cookies()).get("barberflow-guest-" + slug)?.value || "").trim();
  if (!customer || customer.length > 120 || !/^\d{10,11}$/.test(phone) || !isUuid(token)) return { message: "Confira o nome, o telefone e o código da reserva." };
  const supabase = await supabaseServer();
  if (!supabase) return { message: "Consulta indisponível. Tente novamente." };
  const params = { token, shop_slug: slug, customer, phone };
  const result = await supabase.rpc("barberflow_guest_details", params);
  if (result.error || !result.data) return { message: "Não foi possível localizar a reserva. Confira os dados informados." };
  const booking = { ...result.data, code: token };
  const day = String(form.get("day") ?? "");
  const slot = String(form.get("slot") ?? "");
  const intent = form.get("intent");
  if (intent === "cancel" || intent === "reschedule") {
    if (intent === "reschedule" && (!validDay(day) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot))) return { booking, message: "Escolha um horário válido." };
    const changed = await supabase.rpc("barberflow_guest_change", { ...params, new_start: intent === "cancel" ? null : day + "T" + slot });
    if (!changed.data || changed.error) return { booking, message: "A alteração não pôde ser feita. Confira as regras da reserva e os horários disponíveis." };
    const updated = await supabase.rpc("barberflow_guest_details", params);
    return { booking: updated.data ? { ...updated.data, code: token } : undefined, success: true, message: intent === "cancel" ? "Agendamento cancelado." : "Agendamento remarcado." };
  }
  if (intent === "slots" && booking.reschedule && validDay(day)) {
    const slots = await supabase.rpc("barberflow_public_slots", { profile_slug: slug, professional: booking.professional_id, service: booking.service_id, booking_day: day });
    return { booking, day, slots: (slots.data ?? []).map((item: { slot: string }) => item.slot.slice(11, 16)), message: slots.error ? "Não foi possível buscar os horários." : undefined };
  }
  return { booking };
}