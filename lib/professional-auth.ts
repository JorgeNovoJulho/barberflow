import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./supabase";

export function professionalAuthAdmin() {
  const config = supabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return config && key ? createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
