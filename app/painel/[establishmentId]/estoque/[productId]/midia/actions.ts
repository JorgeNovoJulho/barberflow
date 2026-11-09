"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../../../lib/establishments";
import { productPhotoBucket, productVideoBucket, productMediaSlots, productImageLimit, productVideoLimit, productImageTypes, productVideoTypes } from "../../../../../../lib/product-media";
import { supabaseServer } from "../../../../../../lib/supabase";

export async function changeMedia(shop: string, product: string, slot: string, remove: boolean, form: FormData) {
  if (!isUuid(shop) || !isUuid(product)) redirect("/painel");
  const path = `/painel/${shop}/estoque/${product}/midia`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path }));
  if (!productMediaSlots.some((allowed) => allowed === slot)) redirect(path + "?estado=invalido");

  const video = slot === "video";
  const bucket = supabase.storage.from(video ? productVideoBucket : productPhotoBucket);
  const key = `${shop}/${product}/${slot}`;
  const file = form.get("file");
  if (!remove && (!(file instanceof File) || file.size === 0
    || file.size > (video ? productVideoLimit : productImageLimit)
    || !(video ? productVideoTypes : productImageTypes).includes(file.type))) {
    redirect(path + "?estado=" + (video ? "video" : "foto"));
  }
  const { error } = remove ? await bucket.remove([key])
    : await bucket.upload(key, file as File, { contentType: (file as File).type, upsert: true, cacheControl: "0" });
  revalidatePath(path);
  redirect(path + "?estado=" + (error ? "falha" : remove ? "removida" : "salva"));
}
