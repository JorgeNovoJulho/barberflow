"use server";

import { redirect } from "next/navigation";
import { isSegment, isUuid, parsePrice } from "../../lib/establishments";
import { supabaseServer } from "../../lib/supabase";

function field(data: FormData, key: string) {
  return String(data.get(key) ?? "").trim();
}

function finish(path: string, status: string): never {
  redirect(path + "?estado=" + status);
}

async function authenticated(path: string) {
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path }));
  return supabase;
}

export async function createEstablishment(data: FormData) {
  const supabase = await authenticated("/painel");
  const name = field(data, "name");
  const segment = field(data, "segment");
  if (!name || name.length > 120 || !isSegment(segment)) finish("/painel", "invalido");

  const { data: establishment, error } = await supabase.from("barberflow_establishments")
    .insert({ name, segment }).select("id").single();
  if (error || !establishment) finish("/painel", "falha");
  finish("/painel/" + establishment.id + "/servicos", "negocio-criado");
}

export async function saveService(establishmentId: string, serviceId: string | null, data: FormData) {
  if (!isUuid(establishmentId)) redirect("/painel");
  const path = "/painel/" + establishmentId + "/servicos";
  const supabase = await authenticated(path);
  const name = field(data, "name");
  const description = field(data, "description");
  const category = field(data, "category");
  const price = parsePrice(field(data, "price"));
  const display_order = Number(field(data, "order"));
  const minutes = Number(field(data, "duration"));
  if (!name || name.length > 120 || description.length > 1000 || category.length > 80
    || price === null || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440
    || !Number.isInteger(display_order) || display_order < 0 || display_order > 9999
    || (serviceId !== null && !isUuid(serviceId))) finish(path, "invalido");

  const fields = { name, description, category, price_cents: price, duration_minutes: minutes, display_order };
  const query = serviceId
    ? supabase.from("barberflow_services").update(fields).eq("id", serviceId).eq("establishment_id", establishmentId)
    : supabase.from("barberflow_services").insert({ ...fields, establishment_id: establishmentId });
  const { data: saved, error } = await query.select("id").maybeSingle();
  finish(path, error || !saved ? "falha" : "salvo");
}

export async function changeServiceAvailability(establishmentId: string, serviceId: string, active: boolean) {
  if (!isUuid(establishmentId) || !isUuid(serviceId)) redirect("/painel");
  const path = "/painel/" + establishmentId + "/servicos";
  const supabase = await authenticated(path);
  const { data, error } = await supabase.from("barberflow_services")
    .update({ active }).eq("id", serviceId).eq("establishment_id", establishmentId).select("id").maybeSingle();
  finish(path, error || !data ? "falha" : active ? "ativado" : "arquivado");
}

export async function moveService(establishmentId: string, serviceId: string, neighborId: string, step: -1 | 1) {
  if (!isUuid(establishmentId) || !isUuid(serviceId) || !isUuid(neighborId)) redirect("/painel");
  const path = `/painel/${establishmentId}/servicos`;
  const supabase = await authenticated(path);
  const { data, error } = await supabase.rpc("barberflow_move_service", {
    shop: establishmentId, service: serviceId, neighbor: neighborId, step,
  });
  finish(path, error ? "falha" : data ? "servico-movido" : "ordem-alterada");
}
