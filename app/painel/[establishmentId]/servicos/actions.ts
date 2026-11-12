"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";

export async function saveServiceProfessionals(shop: string, service: string, form: FormData) {
  if (!isUuid(shop) || !isUuid(service)) redirect("/painel");
  const path = `/painel/${shop}/servicos`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) {
    redirect("/login?" + new URLSearchParams({ next: path }));
  }
  const professionals = form.getAll("professional").map(String);
  if (professionals.some((id) => !isUuid(id))) redirect(path + "?estado=falha&vincular=" + service);
  const { data, error } = await supabase.rpc("barberflow_set_service_professionals", { shop, service, professionals });
  if (data && !error) {
    revalidatePath(path);
    revalidatePath(`/painel/${shop}/profissionais`);
  }
  const status = error?.code === "BF001" ? "limite-vinculos" : error || !data ? "falha" : "vinculos-salvos";
  redirect(path + "?" + new URLSearchParams({ estado: status, vincular: service }) + "#vincular-" + service);
}
