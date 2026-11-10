import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "./supabase";

export const masterPath = "/gestao-master";

export async function isMasterAccount(
  supabase: NonNullable<Awaited<ReturnType<typeof supabaseServer>>>,
  email: unknown,
) {
  if (typeof email !== "string" || email.toLowerCase() !== "jorgericardosalgado@gmail.com") return false;
  const { data, error } = await supabase.rpc("barberflow_is_master");
  return !error && data === true;
}

export const hasMasterSession = cache(async () => {
  const supabase = await supabaseServer();
  if (!supabase) return false;
  const { data } = await supabase.auth.getClaims();
  return isMasterAccount(supabase, data?.claims.email);
});

export async function requireMaster(next = masterPath) {
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase) notFound();
  if (!user) redirect("/login?" + new URLSearchParams({ next }));
  if (!user.email_confirmed_at || !(await isMasterAccount(supabase, user.email))) notFound();
  return supabase;
}
