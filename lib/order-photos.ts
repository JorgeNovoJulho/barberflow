import type { SupabaseClient } from "@supabase/supabase-js";
import { productMediaSlots, productPhotoBucket } from "./product-media";

export async function orderProductPhotos(supabase: SupabaseClient, orders: { establishment_id: string; product_id: string }[]) {
  const folders = [...new Set(orders.map(({ establishment_id, product_id }) => `${establishment_id}/${product_id}`))];
  const photos = new Map<string, string>();
  for (let start = 0; start < folders.length; start += 20) {
    const paths = folders.slice(start, start + 20).flatMap((folder) => productMediaSlots.slice(0, -1).map((slot) => folder + "/" + slot));
    const { data } = await supabase.storage.from(productPhotoBucket).createSignedUrls(paths, 300);
    for (const image of data ?? []) {
      if (image.error || !image.path || !image.signedUrl) continue;
      const folder = image.path.slice(0, image.path.lastIndexOf("/"));
      if (!photos.has(folder)) photos.set(folder, image.signedUrl);
    }
  }
  return photos;
}
