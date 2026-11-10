"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isUuid,parsePrice } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";

export async function saveSale(shop:string,id:string,revision:number,form:FormData) {
  if (!isUuid(shop) || !isUuid(id)) redirect("/painel");
  const path = `/painel/${shop}/caixa?comanda=${id}`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next:path }));
  const value = (key:string)=>String(form.get(key) ?? "").trim();
  const operation = value("operation");
  if (["confirm","cancel"].includes(operation) && form.get("acknowledged")!=="on") redirect(path+"&estado=invalid");
  const selections = [];
  for (let index=0; index<4; index++) {
    const service = value("service"+index);
    const product = value("product"+index);
    const units = value("units"+index);
    if (service) selections.push({ kind:"service",id:service,units:1 });
    if (product) selections.push({ kind:"product",id:product,units:/^\d{1,5}$/.test(units) ? Number(units) : 0 });
  }
  const { data,error } = await supabase.rpc("barberflow_save_counter_sale",{
    shop_id:shop,sale_id:id,expected_revision:revision,customer:value("customer"),contact:value("phone"),
    selections,operation,payment_method:value("method") || null,payment_reference:value("reference") || null,received_cents:parsePrice(value("received")),
  });
  const overview = `/painel/${shop}/resumo`;
  revalidatePath(overview);
  if (!error && data === "ok" && operation === "save") {
    redirect(overview + "?comanda=salva#comandas-abertas");
  }
  const status = error ? "falha" : String(data ?? "falha");
  redirect(path + "&estado=" + encodeURIComponent(status));
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
