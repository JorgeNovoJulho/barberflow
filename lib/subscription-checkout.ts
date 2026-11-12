import type { SupabaseClient } from "@supabase/supabase-js";

export const subscriptionProofBucket = "barberflow-subscription-proofs";

export async function subscriptionProofLinks(supabase: SupabaseClient, paths: (string | null)[]) {
  const files = paths.filter((path): path is string => Boolean(path));
  if (!files.length) return new Map<string, string>();
  const { data } = await supabase.storage.from(subscriptionProofBucket)
    .createSignedUrls(files, 300, { download: true });
  return new Map((data ?? []).flatMap(({ path, signedUrl }) => path && signedUrl ? [[path, signedUrl]] : []));
}

export const subscriptionLines = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

export async function subscriptionProofPreviews(supabase: SupabaseClient, paths: (string | null)[]) {
  const files = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!files.length) return new Map<string, string>();
  const { data } = await supabase.storage.from(subscriptionProofBucket).createSignedUrls(files, 300);
  return new Map((data ?? []).flatMap(({ path, signedUrl }) => path && signedUrl ? [[path, signedUrl]] : []));
}
