"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isUuid,parsePrice } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import type { Sale } from "./model";

export async function saveSale(shop:string,id:string,revision:number,form:FormData) {
  if (!isUuid(shop) || !isUuid(id)) redirect("/painel");
  const path = `/painel/${shop}/caixa?comanda=${id}`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next:path }));
  const value = (key:string)=>String(form.get(key) ?? "").trim();
  const operation = value("operation");
  if (["confirm","cancel"].includes(operation) && form.get("acknowledged")!=="on") redirect(path+"&estado=invalid");
  const method = value("method");
  if (operation === "charge" && !["pix", "debit", "credit"].includes(method)) {
    redirect(path + "&estado=method#cobranca");
  }
  const closingSaved = operation === "charge" && value("modo") === "fechar";
  const chargePath = path + (closingSaved ? "&modo=fechar" : "");
  let saved: Sale | null = null;
  if (closingSaved) {
    const result = await supabase.rpc("barberflow_counter_sale",{shop_id:shop,sale_id:id});
    saved = result.data as Sale | null;
    if (result.error || !saved || saved.state !== "open" || saved.revision !== revision) {
      redirect(chargePath + "&estado=changed#cobranca");
    }
  }
  const selections = [];
  for (let index=0; index<4; index++) {
    const service = value("service"+index);
    const product = value("product"+index);
    const units = value("units"+index);
    if (service) selections.push({ kind:"service",id:service,units:1 });
    if (product) selections.push({ kind:"product",id:product,units:/^\d{1,5}$/.test(units) ? Number(units) : 0 });
  }
  const input = {
    shop_id:shop,sale_id:id,expected_revision:revision,customer:saved?.client_name ?? value("customer"),contact:saved?.phone ?? value("phone"),
    selections:saved?.items.map(({kind,id,units})=>({kind,id,units})) ?? selections,operation,payment_method:method || null,payment_reference:value("reference") || null,received_cents:parsePrice(value("received")),
  };
  const { data,error } = await supabase.rpc("barberflow_save_counter_sale",input);
  const overview = `/painel/${shop}/resumo`;
  revalidatePath(overview);
  if (!error && data === "ok" && operation === "save") {
    redirect(overview + "?comanda=salva#comandas-abertas");
  }
  if (!error && data === "pix_missing" && operation === "charge" && !closingSaved) {
    // Preserve the draft before leaving to configure the establishment's receiving account.
    const draft = await supabase.rpc("barberflow_save_counter_sale",{
      ...input,operation:"save",payment_method:null,
    });
    if (draft.error || draft.data !== "ok") {
      redirect(path + "&estado=" + encodeURIComponent(draft.error ? "falha" : String(draft.data ?? "falha")) + "#cobranca");
    }
    revalidatePath(overview);
  }
  const status = error ? "falha" : String(data ?? "falha");
  if (operation === "charge") {
    redirect(chargePath + "&estado=" + encodeURIComponent(status === "ok" ? "cobranca_preparada" : status) + "#cobranca");
  }
  redirect(path + "&estado=" + encodeURIComponent(operation === "confirm" && status === "ok" ? "recebido" : status) + "#cobranca");
}
export async function saveCheckoutTimezone(shop:string,form:FormData) {
  if (!isUuid(shop)) redirect("/painel");
  const path = `/painel/${shop}/caixa?aba=fechamento`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?"+new URLSearchParams({next:path}));
  const timezone = String(form.get("timezone") ?? "");
  if (!["America/Sao_Paulo","America/Manaus","America/Rio_Branco","America/Noronha"].includes(timezone)) redirect(path+"&estado=invalid");
  const {data,error} = await supabase.from("barberflow_establishments").update({checkout_timezone:timezone})
    .eq("id",shop).eq("owner_id",user.id).select("id").maybeSingle();
  redirect(path+"&estado="+(data && !error ? "timezone_saved" : "falha"));
}
