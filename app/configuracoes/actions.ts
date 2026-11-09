"use server";

import { revalidatePath } from "next/cache";
import { isThemeId } from "../../lib/themes";
import { supabaseServer } from "../../lib/supabase";

export async function saveTheme(theme: string) {
  if (!isThemeId(theme)) return false;
  const supabase = await supabaseServer();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("barberflow_user_preferences").upsert({
    user_id: user.id,
    theme,
  });
  if (error) return false;
  revalidatePath("/", "layout");
  return true;
}
