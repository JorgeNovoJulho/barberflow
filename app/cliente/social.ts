import { redirect } from "next/navigation";
import { supabaseServer } from "../../lib/supabase";

export const socialBucket = "barberflow-social";
export const socials = {
  Instagram: ["instagram.com"],
  Facebook: ["facebook.com", "fb.com"],
  YouTube: ["youtube.com", "youtu.be"],
  TikTok: ["tiktok.com"],
};

export async function socialSession() {
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user?.email_confirmed_at || user.is_anonymous) redirect("/login?next=%2Fcliente");
  return { supabase, user };
}

export function pageIndex(value: string | undefined) {
  return /^\d{1,4}$/.test(value ?? "") ? Number(value) : 0;
}

export async function mediaLinks(supabase: Awaited<ReturnType<typeof socialSession>>["supabase"], paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const { data } = await supabase.storage.from(socialBucket).createSignedUrls(unique, 300);
  const links = new Map<string, string>();
  for (const item of data ?? []) if (item.path && item.signedUrl) links.set(item.path,item.signedUrl);
  return links;
}
