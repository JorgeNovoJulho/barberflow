"use server";

import { randomUUID } from "node:crypto";
import { isUuid } from "../../../../lib/establishments";
import { productImageLimit, productImageTypes, productVideoLimit, productVideoTypes } from "../../../../lib/product-media";
import { supabaseServer } from "../../../../lib/supabase";

export async function uploadProfileMedia(shop: string, slot: string, form: FormData) {
  if (!isUuid(shop) || (!/^(logo|cover|cover-studio|video|gallery-[1-8])$/.test(slot)
    && !(slot.startsWith("professional-") && isUuid(slot.slice("professional-".length))))) return null;
  const video = slot === "video";
  const file = form.get("media");
  if (!(file instanceof File) || !file.size || file.size > (video ? productVideoLimit : productImageLimit)
    || !(video ? productVideoTypes : productImageTypes).includes(file.type)) return null;

  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) return null;
  const bucket = supabase.storage.from("barberflow-profile-media");
  const studio = slot === "cover-studio";
  if (studio && file.type !== "image/png") return null;
  const path = studio ? `${shop}/cover-studio-${randomUUID()}.png` : `${shop}/${slot}`;
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: !studio, cacheControl: "0" });
  if (error) return null;
  return bucket.getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
}
