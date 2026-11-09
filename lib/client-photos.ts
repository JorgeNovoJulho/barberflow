import type { SupabaseClient } from "@supabase/supabase-js";

export const clientPhotoBucket = "barberflow-client-photos";

export async function clientPhotoLinks(supabase: SupabaseClient, clients: { photo_path?: string }[]) {
  const paths = clients.flatMap(({ photo_path }) => photo_path ? [photo_path] : []);
  if (!paths.length) return new Map<string, string>();
  const { data } = await supabase.storage.from(clientPhotoBucket).createSignedUrls(paths, 300);
  return new Map((data ?? []).flatMap(({ path, signedUrl, error }) => path && signedUrl && !error ? [[path, signedUrl]] : []));
}
