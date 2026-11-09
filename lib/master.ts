import { notFound } from "next/navigation";
import { supabaseServer } from "./supabase";

export async function requireMaster() {
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user || !user.email_confirmed_at || user.email?.toLowerCase() !== "jorgericardosalgado@gmail.com") notFound();
  const { data, error } = await supabase.rpc("barberflow_is_master");
  if (error || data !== true) notFound();
  return supabase;
}
