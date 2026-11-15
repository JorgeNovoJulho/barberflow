"use server";

import { redirect } from "next/navigation";
import { parsePrice } from "../lib/establishments";
import { supabaseServer } from "../lib/supabase";

export async function collectSplitOrder(shop: string, appointment: string, expected: number, professional: boolean, form: FormData) {
  const client = await supabaseServer();
  const { data } = form.get("confirmed") === "on" ? await client?.rpc("barberflow_collect_order_split", {
    shop, appointment, expected,
    first_method: form.get("first_method"),
    first_amount: parsePrice(String(form.get("first_amount") ?? "")),
    second_method: form.get("second_method"),
    cash_received: parsePrice(String(form.get("cash") ?? "")),
  }) ?? {} : {};
  if (professional && data === true) redirect(`/equipe/${shop}/meu-painel?estado=salvo`);
  redirect(professional ? `/equipe/${shop}/comanda/${appointment}?estado=falha` :
    `/painel/${shop}/comanda/${appointment}?pagamento=${data ? "recebido" : "falha"}#recebimento`);
}

export async function collectSplitCounter(shop: string, sale: string, revision: number, expected: number, professional: boolean, form: FormData) {
  const client = await supabaseServer();
  const { data } = form.get("confirmed") === "on" ? await client?.rpc("barberflow_collect_counter_split", {
    shop_id: shop, sale_id: sale, revision, expected,
    first_method: form.get("first_method"),
    first_amount: parsePrice(String(form.get("first_amount") ?? "")),
    second_method: form.get("second_method"),
    cash_received: parsePrice(String(form.get("cash") ?? "")),
  }) ?? {} : {};
  const path = professional ? `/equipe/${shop}/avulsos` : `/painel/${shop}/caixa`;
  redirect(`${path}?comanda=${sale}&estado=${data === true ? "recebido" : "falha&modo=fechar"}#cobranca`);
}
