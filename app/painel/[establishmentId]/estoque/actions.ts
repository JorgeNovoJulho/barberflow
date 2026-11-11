"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid, parsePrice } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { validDay } from "../../../../lib/agenda";

function get(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

async function context(shop: string, appointment?: string) {
  if (!isUuid(shop) || (appointment !== undefined && !isUuid(appointment))) redirect("/painel");
  const path = appointment ? `/painel/${shop}/comanda/${appointment}` : `/painel/${shop}/estoque`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path }));
  return { supabase, finish(status: string): never {
    revalidatePath(path);
    redirect(path + "?estado=" + status);
  } };
}

export async function saveProduct(shop: string, product: string | null, form: FormData) {
  const { supabase, finish } = await context(shop);
  const name = get(form, "name");
  const sku = get(form, "sku");
  const barcode = get(form, "barcode");
  const description = get(form, "description");
  const showcase = product === null || form.has("showcase");
  const price = parsePrice(get(form, "price"));
  const rawCost = get(form, "cost");
  const cost = rawCost ? parsePrice(rawCost) : null;
  const minimum = Number(get(form, "minimum"));
  const initial = Number(get(form, "initial"));
  const expiry = get(form, "expiry");
  if (!name || name.length > 120 || sku.length > 60 || description.length > 1500 || !/^\d{0,32}$/.test(barcode) || price === null || (product && !isUuid(product))) finish("invalido");
  if ((rawCost && cost === null) || !Number.isInteger(minimum) || minimum < 0 || minimum > 1000000
    || (!product && (!Number.isInteger(initial) || initial < 0 || initial > 1000000))
    || (expiry && !validDay(expiry))) finish("invalido");
  const fields = { name, sku, barcode, description, showcase, price_cents: price, cost_cents: cost, minimum_stock: minimum, expires_on: expiry || null };
  const { data, error } = product
    ? await supabase.from("barberflow_products").update(fields)
      .eq("id", product).eq("establishment_id", shop).select("id").maybeSingle()
    : await supabase.rpc("barberflow_create_product", { shop, product_name: name, product_sku: sku,
      sale_price: price, unit_cost: cost, stock_floor: minimum, expiry: expiry || null, initial_units: initial, product_barcode: barcode, product_description: description, in_showcase: showcase });
  if (!product && !error && typeof data === "string" && isUuid(data)) {
    revalidatePath(`/painel/${shop}/estoque`);
    redirect(`/painel/${shop}/estoque/${data}/midia?estado=produto`);
  }
  finish(error?.code === "23505" ? error.message.includes("barberflow_products_barcode") ? "barcode" : "sku" : error || !data ? "falha" : "salvo");
}

export async function saveProductPromotion(shop: string, product: string, remove: boolean, form: FormData) {
  const { supabase, finish } = await context(shop);
  const units = Number(get(form, "bundle_units"));
  const cents = parsePrice(get(form, "bundle_price"));
  const until = get(form, "offer_until");
  if (!isUuid(product) || (!remove && (!Number.isInteger(units) || units < 1 || units > 10000 || !cents || !validDay(until)))) finish("promocao-invalida");
  const { data, error } = await supabase.rpc("barberflow_save_product_promotion", {
    shop, product, bundle_units: remove ? null : units, bundle_cents: remove ? null : cents, offer_until: remove ? null : until,
  });
  finish(error || !data ? "promocao-invalida" : remove ? "promocao-removida" : "promocao-salva");
}

export async function changeProductStatus(shop: string, product: string, operation: "freeze" | "unfreeze" | "delete") {
  const { supabase, finish } = await context(shop);
  if (!isUuid(product)) finish("invalido");
  const { data, error } = await supabase.rpc("barberflow_set_product_status", { shop, product, operation });
  if (error || !data) finish("falha");
  finish(operation === "delete" ? "excluido" : operation === "freeze" ? "congelado" : "descongelado");
}

export async function adjustStock(shop: string, product: string, form: FormData) {
  const { supabase, finish } = await context(shop);
  const amount = Number(get(form, "amount"));
  const note = get(form, "note");
  if (!isUuid(product) || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1000000 || !note || note.length > 240) finish("invalido");
  const { error } = await supabase.rpc("barberflow_adjust_stock", { shop, product, amount, note });
  finish(error?.code === "22023" ? "saldo" : error ? "falha" : "movimento");
}

export async function setOrderProduct(shop: string, appointment: string, boundProduct: string | null, form: FormData) {
  const { supabase, finish } = await context(shop, appointment);
  const product = boundProduct ?? get(form, "product");
  const raw = get(form, "units");
  const units = Number(raw);
  if (!isUuid(product) || !/^\d+$/.test(raw) || units > 10000 || (!boundProduct && units === 0)) finish("invalido");
  const { error } = await supabase.rpc("barberflow_set_order_product", { shop, appointment, product, units });
  finish(error?.details === "product_inactive" ? "produto-indisponivel" : error ? "falha" : "item");
}

export async function closeOrder(shop: string, appointment: string) {
  const { supabase, finish } = await context(shop, appointment);
  const { error } = await supabase.rpc("barberflow_close_order", { shop, appointment });
  if (error) finish(error.details === "promotion_expired" ? "promocao-vencida" : error.code === "22023" ? "fechamento" : "falha");
  const path = `/painel/${shop}/comanda/${appointment}`;
  revalidatePath(path);
  redirect(path + "?estado=fechada#recebimento");
}

export async function setOrderService(shop: string, appointment: string, boundService: string | null, form: FormData) {
  const { supabase, finish } = await context(shop, appointment);
  const service = boundService ?? get(form, "service");
  if (!isUuid(service)) finish("invalido");
  const { data, error } = await supabase.rpc("barberflow_set_order_service", {
    shop, appointment, service, remove_item: boundService !== null,
  });
  finish(error || !data ? "falha" : "item");
}
