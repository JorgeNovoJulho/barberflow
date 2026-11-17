import { supabaseServer } from "./supabase";

import { serviceMediaBucket } from "./service-media-config";
export type ServiceMediaPaths = { photo_path: string; video_path: string; extra_photos?: string[]; video_url?: string };

export async function serviceMediaUrls(services: ServiceMediaPaths[]) {
  const signed = new Map<string, string>();
  const paths = [...new Set(services.flatMap(({ photo_path, extra_photos }) => [photo_path, ...(extra_photos ?? [])]).filter(Boolean))];
  if (!paths.length) return signed;
  const supabase = await supabaseServer();
  if (!supabase) return signed;
  for (let index = 0; index < paths.length; index += 100) {
    const result = await supabase.storage.from(serviceMediaBucket).createSignedUrls(paths.slice(index, index + 100), 600);
    for (const item of result.data ?? []) {
      if (item.path && item.signedUrl && !item.error) signed.set(item.path, item.signedUrl);
    }
  }
  return signed;
}
