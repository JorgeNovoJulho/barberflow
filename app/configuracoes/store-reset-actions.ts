"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "../../lib/supabase";

export async function configureStoreReset(form: FormData) {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/configuracoes?restauracao=erro");
  const shop = form.get("shop");
  const current = form.get("current");
  const password = form.get("password");
  if (typeof shop !== "string" || typeof current !== "string" ||
    typeof password !== "string" || password !== form.get("confirmation")) {
    redirect("/configuracoes?restauracao=erro");
  }
  const { data, error } = await supabase.rpc("barberflow_configure_store_reset", {
    target_shop: shop, account_password: current, reset_password: password,
  });
  redirect(data === true && !error ? "/configuracoes?restauracao=salva" : "/configuracoes?restauracao=erro");
}

export async function restoreStore(form: FormData) {
  const supabase = await supabaseServer();
  const shop = form.get("shop");
  const secret = form.get("secret");
  const confirmation = form.get("shop_name");
  if (!supabase || typeof shop !== "string" || typeof secret !== "string" ||
    typeof confirmation !== "string" || form.get("acknowledged") !== "yes") {
    redirect("/configuracoes?restauracao=falha");
  }
  const { data, error } = await supabase.rpc("barberflow_restore_store", {
    target_shop: shop, secret, confirmation,
  });
  redirect(data === true && !error ? "/configuracoes?restauracao=concluida" : "/configuracoes?restauracao=falha");
}
