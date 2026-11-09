"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { httpsUrl } from "../../../../lib/business-profile";

function value(data: FormData, field: string) {
  return String(data.get(field) ?? "").trim();
}

function commissionRate(raw: string) {
  const rate = raw.replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(rate) || Number(rate) > 100) return null;
  return Math.round(Number(rate) * 100);
}

function result(path: string, status: string): never {
  revalidatePath(path);
  redirect(path + "?estado=" + status);
}

async function context(shop: string, professional?: string) {
  if (!isUuid(shop) || (professional !== undefined && !isUuid(professional))) redirect("/painel");
  const path = `/painel/${shop}/profissionais`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path }));
  return { path, supabase };
}

export async function saveProfessional(shop: string, professional: string | null, form: FormData) {
  const { path, supabase } = await context(shop, professional ?? undefined);
  const name = value(form, "name");
  const description = value(form, "description");
  const photo_url = value(form, "photo");
  const commission_bps = commissionRate(value(form, "commission"));
  const product_commission_bps = commissionRate(value(form, "product_commission"));
  if ((photo_url && (photo_url.length > 500 || !httpsUrl(photo_url)))
    || commission_bps === null || product_commission_bps === null) result(path, "invalido");
  if (!name || name.length > 120 || description.length > 1000) result(path, "invalido");
  const profile = { name, description, photo_url, commission_bps, product_commission_bps };
  const query = professional
    ? supabase.from("barberflow_professionals").update({ ...profile, active: form.get("active") === "on" }).eq("establishment_id", shop).eq("id", professional)
    : supabase.from("barberflow_professionals").insert({ ...profile, establishment_id: shop });
  const { data, error } = await query.select("id").maybeSingle();
  result(path, error || !data ? "falha" : "profissional-salvo");
}

export async function saveAssignments(shop: string, professional: string, form: FormData) {
  const { path, supabase } = await context(shop, professional);
  const services = form.getAll("service").map(String);
  if (services.some((id) => !isUuid(id))) result(path, "invalido");
  const { error } = await supabase.rpc("barberflow_set_professional_services", { shop, professional, services });
  result(path, error ? "falha" : "vinculos-salvos");
}

const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export async function saveWorkingDay(shop: string, professional: string, form: FormData) {
  const { path, supabase } = await context(shop, professional);
  const rawDay = value(form, "weekday");
  if (!/^[0-6]$/.test(rawDay)) result(path, "invalido");
  const key = { establishment_id: shop, professional_id: professional, weekday: Number(rawDay) };
  if (form.get("closed") === "on") {
    const { error } = await supabase.from("barberflow_professional_hours").delete().match(key);
    result(path, error ? "falha" : "horario-salvo");
  }

  const starts_at = value(form, "starts_at");
  const ends_at = value(form, "ends_at");
  const break_start = value(form, "break_start");
  const break_end = value(form, "break_end");
  if (!time.test(starts_at) || !time.test(ends_at) || starts_at >= ends_at
    || ((break_start || break_end) && (!time.test(break_start) || !time.test(break_end)
    || starts_at >= break_start || break_start >= break_end || break_end >= ends_at))) result(path, "horario-invalido");

  const { error } = await supabase.rpc("barberflow_save_working_day", {
    shop, professional, day: key.weekday, opening: starts_at, closing: ends_at,
    pause_start: break_start || null, pause_end: break_end || null,
  });
  result(path, error ? "falha" : "horario-salvo");
}
