"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";

export async function saveClient(shop: string, client: string | null, form: FormData) {
  if (!isUuid(shop) || (client !== null && !isUuid(client))) redirect("/painel");
  const path = `/painel/${shop}/clientes`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path }));

  const get = (key: string) => String(form.get(key) ?? "").trim();
  const name = get("name");
  const phone = get("phone");
  const preferences = get("preferences");
  const notes = get("notes");
  if (!name || name.length > 120 || phone.length > 30 || preferences.length > 1000 || notes.length > 1000) redirect(path + "?estado=invalido");
  const fields = { name, phone, preferences, notes };
  const query = client
    ? supabase.from("barberflow_clients").update({ ...fields, active: form.get("active") === "on" }).eq("id", client).eq("establishment_id", shop)
    : supabase.from("barberflow_clients").insert({ ...fields, establishment_id: shop });
  const { data, error } = await query.select("id").maybeSingle();
  revalidatePath(path);
  redirect(path + "?estado=" + (error || !data ? "falha" : "cliente-salvo"));
}
