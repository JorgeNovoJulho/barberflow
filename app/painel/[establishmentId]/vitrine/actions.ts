"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid, parsePrice } from "../../../../lib/establishments";
import { pixLabel } from "../../../../lib/pix";
import { supabaseServer } from "../../../../lib/supabase";

async function showcaseContext(shop: string) {
  if (!isUuid(shop)) redirect("/painel");
  const path = `/painel/${shop}/vitrine`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  return { supabase, finish(state: string): never {
    revalidatePath(`/painel/${shop}`, "layout");
    redirect(path + "?estado=" + state);
  } };
}

export async function saveShowcasePix(shop: string, form: FormData) {
  const { supabase, finish } = await showcaseContext(shop);
  const pix_key = String(form.get("key") ?? "").trim();
  const merchant = pixLabel(String(form.get("merchant") ?? ""), 25);
  const city = pixLabel(String(form.get("city") ?? ""), 15);
  if (!/^[\x21-\x7e]{1,77}$/.test(pix_key) || !merchant || !city) finish("invalido");
  const { error } = await supabase.from("barberflow_showcase_pix").upsert({ establishment_id: shop, pix_key, merchant, city });
  finish(error ? "falha" : "pix");
}

export async function disableShowcasePix(shop: string) {
  const { supabase, finish } = await showcaseContext(shop);
  const { error } = await supabase.from("barberflow_showcase_pix").delete().eq("establishment_id", shop);
  finish(error ? "falha" : "pausado");
}

export async function updateShowcaseOrder(shop: string, order: string, operation: "confirm" | "ready" | "collected" | "read", form: FormData) {
  const { supabase, finish } = await showcaseContext(shop);
  const received = operation === "confirm" ? parsePrice(String(form.get("amount") ?? "")) : null;
  const reference = operation === "confirm" ? String(form.get("reference") ?? "").trim() : null;
  if (!isUuid(order) || (operation === "confirm" && (!received || !reference || reference.length < 6 || reference.length > 100))) finish("invalido");
  const { data, error } = await supabase.rpc("barberflow_update_showcase_order", {
    shop, order_id: order, operation, received_cents: received, reference,
  });
  finish(error?.code === "23505" ? "duplicado" : error?.code === "22023" ? "estoque" : error ? "falha"
    : !data ? "conferir" : operation === "confirm" ? "pago" : "atualizado");
}
