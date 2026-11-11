"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validDay } from "../../../../lib/agenda";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";

const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function field(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

async function context(shop: string, day: string, team = false) {
  if (!isUuid(shop) || !validDay(day)) redirect("/painel");
  const path = team ? `/equipe/${shop}` : `/painel/${shop}/agenda`;
  const query = path + "?dia=" + day;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: query }));
  return { supabase, path, finish(status: string): never {
    revalidatePath(path);
    redirect(query + "&estado=" + status);
  } };
}

export async function createEntry(shop: string, day: string, kind: "appointment" | "block", team: boolean, form: FormData) {
  const { supabase, finish } = await context(shop, day, team);
  const professional = field(form, "professional");
  const service = field(form, "service");
  const start = field(form, "start");
  const end = field(form, "end");
  const customer = field(form, "customer");
  const client = field(form, "client");
  const phone = field(form, "phone");
  const note = field(form, "note");
  if ((kind !== "appointment" && kind !== "block") || !isUuid(professional) || !validTime.test(start) || note.length > 1000
    || (kind === "appointment" && (!isUuid(service) || (client ? !isUuid(client) : !customer || customer.length > 120 || phone.length > 30)))
    || (kind === "block" && (!validTime.test(end) || start >= end))) return finish("invalido");

  const request = kind === "appointment" && client
    ? supabase.rpc("barberflow_book_registered_client", { shop, professional, service, start_at: day + "T" + start, client, note })
    : supabase.rpc("barberflow_create_schedule_entry", {
    shop, professional, service: kind === "appointment" ? service : null,
    start_at: day + "T" + start,
    block_end: kind === "block" ? day + "T" + end : null,
    customer: kind === "appointment" ? customer : null,
    phone: kind === "appointment" ? phone : null,
    note,
  });
  const { error } = await request;
  if (error?.code === "BF001") return finish("limite-plano");
  if (error?.code === "23P01") return finish("conflito");
  if (error?.code === "22023") return finish("indisponivel");
  return finish(error ? "falha" : "salvo");
}

export async function updateEntry(shop: string, day: string, entry: string, newState: string) {
  const { supabase, finish } = await context(shop, day);
  if (!isUuid(entry) || !["scheduled", "cancelled", "completed", "no_show"].includes(newState)) return finish("invalido");
  const { data, error } = await supabase.rpc("barberflow_set_schedule_state", { shop, entry, new_state: newState });
  return finish(error || !data ? "falha" : "atualizado");
}

export async function rescheduleEntry(shop: string, day: string, entry: string, team: boolean, form: FormData) {
  const { supabase, path, finish } = await context(shop, day, team);
  const targetDay = field(form, "date");
  const targetTime = field(form, "start");
  if (!isUuid(entry) || !validDay(targetDay) || !validTime.test(targetTime)) return finish("invalido");
  const { data, error } = await supabase.rpc("barberflow_reschedule", {
    shop, entry, new_start: targetDay + "T" + targetTime,
  });
  if (error?.code === "BF001") return finish("limite-plano");
  if (error?.code === "23P01") return finish("conflito");
  if (error?.code === "22023") return finish("indisponivel");
  if (error || !data) return finish("falha");
  revalidatePath(`/painel/${shop}/agenda`);
  redirect(`${path}?dia=${targetDay}&estado=remarcado`);
}

export async function linkCompletedClient(shop: string, day: string, entry: string, form: FormData) {
  const { supabase, finish } = await context(shop, day);
  const person = field(form, "client");
  if (!isUuid(entry) || !isUuid(person)) return finish("invalido");
  const { data, error } = await supabase.rpc("barberflow_link_appointment_client", { shop, entry, person });
  return finish(error || !data ? "falha" : "cliente-vinculado");
}

export async function archiveCancelled(shop: string, day: string, cutoff: string) {
  if (!isUuid(shop) || !validDay(day)) redirect("/painel");
  const path = `/painel/${shop}/agenda?dia=${day}&visao=cancelados`;
  const supabase = await supabaseServer();
  const result = await supabase?.rpc("barberflow_archive_cancelled_appointments", { shop, cutoff });
  if (result?.data) revalidatePath(`/painel/${shop}/agenda`);
  redirect(path + "&estado=" + (result?.data ? "arquivados" : "falha"));
}
