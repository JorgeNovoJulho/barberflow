"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";

async function context(shop: string) {
  if (!isUuid(shop)) redirect("/painel");
  const path = `/painel/${shop}/fidelidade`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  return { supabase, finish(status: string): never {
    revalidatePath(path);
    redirect(path + "?estado=" + status);
  } };
}

export async function saveLoyalty(shop: string, form: FormData) {
  const { supabase, finish } = await context(shop);
  const target = Number(form.get("target"));
  const benefit = String(form.get("benefit") ?? "").trim();
  const services = [...new Set(form.getAll("service").map(String))];
  if (!Number.isInteger(target) || target < 1 || target > 100 || !benefit || benefit.length > 200
    || services.some((service) => !isUuid(service))) return finish("invalido");
  const { error } = await supabase.rpc("barberflow_save_loyalty", {
    shop, active: form.get("enabled") === "on", target, benefit, services,
  });
  return finish(error ? "falha" : "salvo");
}

export async function redeemLoyalty(shop: string, client: string) {
  const { supabase, finish } = await context(shop);
  if (!isUuid(client)) return finish("invalido");
  const { data, error } = await supabase.rpc("barberflow_redeem_loyalty", { shop, person: client });
  return finish(error ? "falha" : data ? "resgatado" : "insuficiente");
}
