"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../lib/establishments";
import { isSection, landingDefaults, parseLandingSettings, validImageUrl } from "../../lib/landing";
import { requireMaster } from "../../lib/master";

const route = "/gestao-master";
const formats: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

function value(form: FormData, field: string) {
  return String(form.get(field) ?? "").trim();
}

function done(status: string): never {
  revalidatePath("/");
  revalidatePath(route);
  redirect(route + "?estado=" + status);
}

export async function saveLandingSettings(form: FormData) {
  const supabase = await requireMaster();
  const raw = Object.fromEntries(Object.keys(landingDefaults).map((key) => [key, value(form, key)]));
  const appearance = parseLandingSettings({ ...raw, discovery: form.has("discovery"), motion: form.has("motion") });
  if (Object.entries(raw).some(([key, input]) => appearance[key as keyof typeof landingDefaults] !== input)) done("invalido");
  const { data, error } = await supabase.from("barberflow_landing_settings").update({ appearance })
    .eq("singleton", true).select("singleton").maybeSingle();
  done(error || !data ? "falha" : "aparencia");
}

export async function saveBlock(id: string | null, form: FormData) {
  const supabase = await requireMaster();
  const section = value(form, "section");
  const title = value(form, "title");
  const body = value(form, "body");
  let imageUrl = value(form, "image_url");
  const imageAlt = value(form, "image_alt");
  const position = Number(value(form, "position"));
  if ((id && !isUuid(id)) || !isSection(section) || !title || title.length > 160
    || body.length > 1200 || imageAlt.length > 240 || imageUrl.length > 1500 || !validImageUrl(imageUrl)
    || !Number.isInteger(position) || position < 0 || position > 9999) done("invalido");

  const image = form.get("image");
  if (image instanceof File && image.size > 0) {
    if (image.size > 950000 || !Object.hasOwn(formats, image.type)) done("imagem");
    const bucket = supabase.storage.from("barberflow-landing");
    const key = crypto.randomUUID() + "." + formats[image.type];
    const { error } = await bucket.upload(key, image, { contentType: image.type });
    if (error) done("falha");
    imageUrl = bucket.getPublicUrl(key).data.publicUrl;
  }

  const fields = { section, title, body, image_url: imageUrl, image_alt: imageAlt, position, published: form.get("published") === "on" };
  const query = id
    ? supabase.from("barberflow_landing_blocks").update(fields).eq("id", id)
    : supabase.from("barberflow_landing_blocks").insert(fields);
  const { data, error } = await query.select("id").maybeSingle();
  done(error || !data ? "falha" : "salvo");
}

export async function deleteBlock(id: string) {
  const supabase = await requireMaster();
  if (!isUuid(id)) done("invalido");
  const { data, error } = await supabase.from("barberflow_landing_blocks").delete().eq("id", id).select("id").maybeSingle();
  done(error || !data ? "falha" : "excluido");
}
