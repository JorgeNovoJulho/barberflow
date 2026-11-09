import { supabaseServer } from "./supabase";

export const serviceMediaBucket = "barberflow-service-media";
export const serviceVideoLimit = 15 * 1024 * 1024;
export type ServiceMediaPaths = { photo_path: string; video_path: string };

export async function serviceMediaUrls(services: ServiceMediaPaths[]) {
  const signed = new Map<string, string>();
  const paths = [...new Set(services.flatMap(({ photo_path, video_path }) => [photo_path, video_path]).filter(Boolean))];
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
