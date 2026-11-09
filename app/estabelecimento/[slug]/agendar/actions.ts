"use server";

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
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path + "?" + query }));
  const start = String(data.get("slot") ?? "");
  const customer = String(data.get("customer") ?? "").trim();
  const phone = String(data.get("phone") ?? "").trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) || !customer || customer.length > 120 || phone.length > 30) {
    query.set("estado", "invalido");
    redirect(path + "?" + query);
  }
  const { data: booking, error } = await supabase.rpc("barberflow_book_online", {
    profile_slug: slug, service, professional, start_at: day + "T" + start, customer, phone,
  });
  if (error || !booking) {
    query.set("estado", ["22023", "23P01"].includes(error?.code ?? "") ? "indisponivel" : "falha");
    redirect(path + "?" + query);
  }
  redirect("/meus-agendamentos?estado=registrado");
}
