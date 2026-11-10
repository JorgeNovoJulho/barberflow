"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { httpsUrl, socialUrl } from "../../../../lib/business-profile";
import { productImageLimit, productImageTypes } from "../../../../lib/product-media";

function value(data: FormData, field: string) {
  return String(data.get(field) ?? "").trim();
}

function commissionRate(raw: string) {
  const rate = (raw || "0").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(rate) || Number(rate) > 100) return null;
  return Math.round(Number(rate) * 100);
}

function result(path: string, status: string): never {
  revalidatePath(path);
  redirect(path + "?estado=" + status);
}

async function context(shop: string, professional: string | undefined, delegated: boolean) {
  if (!isUuid(shop) || (professional !== undefined && !isUuid(professional))) redirect("/painel");
  const path = `/${delegated ? "equipe" : "painel"}/${shop}/profissionais`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path }));
  return { path, supabase };
}

function optionalHttps(value: string) {
  return value && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? "https://" + value : value;
}

export async function saveProfessional(shop: string, professional: string | null, delegated: boolean, form: FormData) {
  const { path, supabase } = await context(shop, professional ?? undefined, delegated);
  const name = value(form, "name");
  const description = value(form, "description");
  const photo = form.get("photo_file");
  const upload = photo instanceof File && photo.size > 0 ? photo : null;
  let photo_url = optionalHttps(value(form, "photo"));
  const rawInstagram = value(form, "instagram");
  const instagramUrl = socialUrl(optionalHttps(rawInstagram), ["instagram.com"]);
  const instagram = instagramUrl ? new URL(instagramUrl).pathname.replace(/^\/|\/$/g, "") : rawInstagram;
  const facebook = optionalHttps(value(form, "facebook"));
  const tiktok = optionalHttps(value(form, "tiktok"));
  const youtube = optionalHttps(value(form, "youtube"));
  const contact = value(form, "whatsapp");
  const whatsapp = contact.replace(/[+()\s-]/g, "");
  const commission_bps = commissionRate(value(form, "commission"));
  const product_commission_bps = commissionRate(value(form, "product_commission"));
  if ((!upload && photo_url && (photo_url.length > 500 || !httpsUrl(photo_url)))
    || commission_bps === null || product_commission_bps === null) return "Confira o nome, a descrição, o link da foto e as comissões entre 0 e 100%.";
  if (!name || name.length > 120 || description.length > 1000) return "Confira o nome, a descrição, o link da foto e as comissões entre 0 e 100%.";
  if ((instagram && !/^@?[A-Za-z0-9_.]{1,30}$/.test(instagram))
    || (facebook && (facebook.length > 500 || !socialUrl(facebook, ["facebook.com", "fb.com"])))
    || (tiktok && (tiktok.length > 500 || !socialUrl(tiktok, ["tiktok.com"])))
    || (youtube && (youtube.length > 500 || !socialUrl(youtube, ["youtube.com", "youtu.be"])))
    || (contact && !/^(55)?\d{10,11}$/.test(whatsapp))) return "Confira o Instagram, o WhatsApp com DDD e os endereços do Facebook, TikTok ou YouTube.";
  const bucket = supabase.storage.from("barberflow-profile-media");
  const object = upload ? `${shop}/professional-photo-${crypto.randomUUID()}` : null;
  if (upload && object) {
    if (upload.size > productImageLimit || !productImageTypes.includes(upload.type)) return "Selecione uma foto JPG, PNG, WebP ou AVIF de até 5 MB.";
    const { error } = await bucket.upload(object, upload, { contentType: upload.type });
    if (error) return "Não foi possível enviar a foto. Você pode tentar novamente ou salvar sem a foto.";
    photo_url = bucket.getPublicUrl(object).data.publicUrl;
  }
  const profile = { name, description, photo_url, instagram, facebook, tiktok, youtube, whatsapp, commission_bps, product_commission_bps,
    inherit_business_hours: form.get("inherit_business_hours") === "on" };
  const query = professional
    ? supabase.from("barberflow_professionals").update({ ...profile, active: form.get("active") === "on" }).eq("establishment_id", shop).eq("id", professional)
    : supabase.from("barberflow_professionals").insert({ ...profile, establishment_id: shop });
  const { data, error } = await query.select("id").maybeSingle();
  if ((error || !data) && object) await bucket.remove([object]);
  if (error) {
    console.error("Falha ao salvar profissional", { code: error.code });
    return error.code === "42501" ? "Sua conta não tem permissão para salvar este profissional." : "O banco recusou o cadastro. Confira os campos e tente novamente.";
  }
  if (!data) return "Não foi possível encontrar o profissional para salvar.";
  revalidatePath(path);
  return { location: path + (professional ? "?estado=profissional-salvo" : "?estado=profissional-incluido") + "#equipe-profissionais" };
}

export async function saveAssignments(shop: string, professional: string, delegated: boolean, form: FormData) {
  const { path, supabase } = await context(shop, professional, delegated);
  const services = form.getAll("service").map(String);
  if (services.some((id) => !isUuid(id))) result(path, "invalido");
  const { error } = await supabase.rpc("barberflow_set_professional_services", { shop, professional, services });
  result(path, error ? "falha" : "vinculos-salvos");
}

export async function moveProfessional(shop: string, professional: string, neighbor: string, step: -1 | 1, delegated: boolean) {
  const { path, supabase } = await context(shop, professional, delegated);
  if (!isUuid(neighbor)) result(path, "invalido");
  const { data, error } = await supabase.rpc("barberflow_move_professional", { shop, professional, neighbor, step });
  result(path, error ? "falha" : data ? "equipe-ordenada" : "equipe-alterada");
}

const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export async function saveWorkingDay(shop: string, professional: string, delegated: boolean, form: FormData) {
  const { path, supabase } = await context(shop, professional, delegated);
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
