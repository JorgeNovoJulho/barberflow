"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isUuid } from "../../../../../lib/establishments";
import { marginTypes } from "../../../../../lib/stock-pricing";
import { supabaseServer } from "../../../../../lib/supabase";

export async function saveMargins(shop: string, form: FormData) {
  if (!isUuid(shop)) redirect("/painel");
  const path = `/painel/${shop}/financeiro/margens`;
  const rates = marginTypes.map(({ id }) => Number(form.get(id)));
  if (marginTypes.some(({ min, max }, index) => !Number.isInteger(rates[index]) || rates[index] < min || rates[index] > max)) redirect(path + "?estado=invalido");
  const supabase = await supabaseServer();
  const result = await supabase?.rpc("barberflow_save_stock_margins", { shop_id: shop, high_rate: rates[0], medium_rate: rates[1], low_rate: rates[2] });
  if (result?.data) revalidatePath(`/painel/${shop}/estoque`);
  redirect(path + (result?.data ? "?estado=salvo" : "?estado=falha"));
}
