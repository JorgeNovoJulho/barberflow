"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validDay } from "../../../../lib/agenda";
import { isUuid } from "../../../../lib/establishments";
import { slugPattern } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";

export async function bookOnline(slug: string, service: string, professional: string, day: string, data: FormData) {
  if (!slugPattern.test(slug) || !isUuid(service) || !isUuid(professional) || !validDay(day)) redirect("/estabelecimentos");
  const query = new URLSearchParams({ servico: service, profissional: professional, dia: day });
  const path = `/estabelecimento/${slug}/agendar`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase) { query.set("estado","falha"); redirect(path + "?" + query); }
  const start = String(data.get("slot") ?? "");
  const customer = String(data.get("customer") ?? "").trim();
  const phone = String(data.get("phone") ?? "").trim();
  const requestId = String(data.get("requestId") ?? "");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) || !customer || customer.length > 120 || phone.length > 30 || !/^[1-9]\d9\d{8}$/.test(phone.replace(/\D/g, "")) || (!user && !isUuid(requestId))) {
    query.set("estado", "invalido");
    redirect(path + "?" + query);
  }
  const { data: booking, error } = await supabase.rpc(user ? "barberflow_book_online" : "barberflow_book_guest", {
    profile_slug: slug, service, professional, start_at: day + "T" + start, customer, phone,
    ...(!user ? { request_id: requestId } : {}),
  });
  if (error || !booking) {
    query.set("estado", ["22023", "23P01"].includes(error?.code ?? "") ? "indisponivel" : "falha");
    redirect(path + "?" + query);
  }
  if (!user) {
    (await cookies()).set("barberflow-guest-" + slug, requestId, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
      path: `/estabelecimento/${slug}`, maxAge: 60 * 60 * 24 * 90,
    });
    redirect(`/estabelecimento/${slug}?agendamento=registrado#agendamento-confirmado`);
  }
  redirect("/meus-agendamentos?estado=registrado");
}
