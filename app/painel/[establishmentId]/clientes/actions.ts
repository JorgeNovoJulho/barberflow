"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { socialUrl } from "../../../../lib/business-profile";
import { clientPhotoBucket } from "../../../../lib/client-photos";
import { productImageLimit, productImageTypes } from "../../../../lib/product-media";
import { supabaseServer } from "../../../../lib/supabase";

export async function saveClient(shop: string, client: string | null, team: boolean, form: FormData) {
  if (!isUuid(shop) || (client !== null && !isUuid(client))) redirect("/painel");
  const path = team ? `/equipe/${shop}/clientes` : `/painel/${shop}/clientes`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path }));

  const get = (key: string) => String(form.get(key) ?? "").trim();
  const name = get("name");
  const phone = get("phone");
  const preferences = get("preferences");
  const notes = get("notes");
  if (!name || name.length > 120 || phone.length > 30 || preferences.length > 1000 || notes.length > 1000) redirect(path + "?estado=invalido");
  const email = get("email");
  const instagram = get("instagram").replace(/^@/, "");
  const facebook = get("facebook");
  const tiktok = get("tiktok");
  const youtube = get("youtube");
  if ((email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    || (instagram && !/^[\w.]{1,30}$/.test(instagram))
    || [[facebook, ["facebook.com", "fb.com"]], [tiktok, ["tiktok.com"]], [youtube, ["youtube.com", "youtu.be"]]]
      .some(([url, hosts]) => typeof url === "string" && url && (url.length > 500 || !socialUrl(url, hosts as string[])))) redirect(path + "?estado=invalido");
  const photo = form.get("photo");
  const bucket = supabase.storage.from(clientPhotoBucket);
  let photoPath: string | undefined;
  if (photo instanceof File && photo.size) {
    if (photo.size > productImageLimit || !productImageTypes.includes(photo.type)) redirect(path + "?estado=cliente-imagem");
    photoPath = `${shop}/${crypto.randomUUID()}`;
    const upload = await bucket.upload(photoPath, photo, { contentType: photo.type });
    if (upload.error) redirect(path + "?estado=cliente-imagem");
  }
  const fields = { name, phone, preferences, notes, email, instagram, facebook, tiktok, youtube,
    ...(photoPath ? { photo_path: photoPath } : {}) };
  const query = client
    ? supabase.from("barberflow_clients").update({ ...fields, active: form.get("active") === "on" }).eq("id", client).eq("establishment_id", shop)
    : supabase.from("barberflow_clients").insert({ ...fields, establishment_id: shop });
  const { data, error } = await query.select("id").maybeSingle();
  if ((error || !data) && photoPath) await bucket.remove([photoPath]);
  revalidatePath(path);
  redirect(path + "?estado=" + (error || !data ? "falha" : "cliente-salvo"));
}
