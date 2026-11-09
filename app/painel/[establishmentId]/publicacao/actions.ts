"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { slugPattern } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { profileFromForm } from "../../../../lib/business-profile";

export async function savePublication(shop: string, form: FormData) {
  if (!isUuid(shop)) redirect("/painel");
  const path = `/painel/${shop}/publicacao`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path }));
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const city = String(form.get("city") ?? "").trim();
  const public_description = String(form.get("description") ?? "").trim();
  const published = form.get("published") === "on";
  const name = String(form.get("name") ?? "").trim();
  const profile_details = profileFromForm(form);
  if (!profile_details || !name || name.length > 120) redirect(path + "?estado=perfil");
  const number = (name: string) => Number(form.get(name));
  const min_notice_minutes = number("min_notice_minutes");
  const max_advance_days = number("max_advance_days");
  const change_notice_hours = number("change_notice_hours");
  const slot_step_minutes = number("slot_step_minutes");
  const preparation_minutes = number("preparation_minutes");
  const between = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
  if ((slug && !slugPattern.test(slug)) || city.length > 100 || public_description.length > 1200
    || (published && (!slug || !city))) redirect(path + "?estado=invalido");
  if (!between(min_notice_minutes, 0, 10080) || !between(max_advance_days, 1, 365)
    || !between(change_notice_hours, 0, 720) || !between(preparation_minutes, 0, 180)
    || ![5, 10, 15, 20, 30, 60].includes(slot_step_minutes)) redirect(path + "?estado=regras");
  const { data, error } = await supabase.from("barberflow_establishments")
    .update({
      name, profile_details, slug: slug || null, city, public_description, published, min_notice_minutes, max_advance_days,
      change_notice_hours, slot_step_minutes, preparation_minutes,
      auto_confirm: form.get("auto_confirm") === "on",
      allow_customer_cancel: form.get("allow_customer_cancel") === "on",
      allow_customer_reschedule: form.get("allow_customer_reschedule") === "on",
    }).eq("id", shop).select("id").maybeSingle();
  revalidatePath(path);
  redirect(path + "?estado=" + (error?.code === "23505" ? "ocupado" : error || !data ? "falha" : "salvo"));
}
