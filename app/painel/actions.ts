"use server";

import { serviceVideoEmbed } from "../../lib/service-presentation";

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

export async function saveService(establishmentId: string, serviceId: string | null, team: boolean, data: FormData) {
  if (!isUuid(establishmentId)) redirect("/painel");
  const path = `/${team ? "equipe" : "painel"}/${establishmentId}/servicos`;
  const supabase = await authenticated(path);
  const name = field(data, "name");
  const description = field(data, "description");
  const category = field(data, "category");
  const videoLink = field(data, "video_url");
  const embed = serviceVideoEmbed(videoLink);
  if (videoLink && !embed) return "video-link-invalido";
  const price = parsePrice(field(data, "price"));
  const display_order = Number(field(data, "order"));
  const duration = Number(field(data, "duration"));
  const minutesMode = data.get("duration_in_minutes") === "on";
  const minutes = minutesMode ? duration : Math.round(duration * 60);
  if (!name || name.length > 120 || description.length > 1000 || category.length > 80
    || price === null || (!minutesMode && duration > 24) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440
    || !Number.isInteger(display_order) || display_order < 0 || display_order > 9999
    || (serviceId !== null && !isUuid(serviceId))) return "invalido";

  const mediaFields: { photo_path?: string; video_path?: string; extra_photos?: string[] } = {};
  const validObject = (object: string, kind: "photo" | "video") => {
    const [shop, filename, ...remaining] = object.split("/");
    return shop === establishmentId && filename?.endsWith(`-${kind}`)
      && isUuid(filename.slice(0, -(kind.length + 1))) && !remaining.length;
  };
  const photos = data.getAll("photo_path").map(String);
  const video = field(data, "video_path");
  if (photos.length > 5 || photos.some(object => !validObject(object, "photo"))
    || (video && !validObject(video, "video"))) return "servico-midia-invalida";
  if (photos.length || data.get("remove_photo") === "on") {
    mediaFields.photo_path = photos[0] ?? "";
    mediaFields.extra_photos = photos.slice(1);
  }
  if (video || data.get("remove_video") === "on") mediaFields.video_path = video;

  const fields = { name, description, category, video_url: embed?.href ?? "", price_cents: price,
    duration_minutes: minutes, display_order, ...mediaFields };
  const query = serviceId
    ? supabase.from("barberflow_services").update(fields).eq("id", serviceId).eq("establishment_id", establishmentId).is("deleted_at", null)
    : supabase.from("barberflow_services").insert({ ...fields, establishment_id: establishmentId });
  const { data: saved, error } = await query.select("id").maybeSingle();
  if (error && !/^[0-9A-Z]{5}$/.test(error.code ?? "")) return "incerto";
  return error || !saved ? "falha" : "salvo";
}

export async function changeServiceAvailability(establishmentId: string, serviceId: string, active: boolean, team: boolean) {
  if (!isUuid(establishmentId) || !isUuid(serviceId)) redirect("/painel");
  const path = `/${team ? "equipe" : "painel"}/${establishmentId}/servicos`;
  const supabase = await authenticated(path);
  const { data, error } = await supabase.from("barberflow_services")
    .update({ active }).eq("id", serviceId).eq("establishment_id", establishmentId).is("deleted_at", null).select("id").maybeSingle();
  finish(path, error || !data ? "falha" : active ? "ativado" : "arquivado");
}

export async function deleteService(establishmentId: string, serviceId: string, team: boolean) {
  if (!isUuid(establishmentId) || !isUuid(serviceId)) redirect("/painel");
  const path = `/${team ? "equipe" : "painel"}/${establishmentId}/servicos`;
  const supabase = await authenticated(path);
  const { data, error } = await supabase.rpc("barberflow_delete_service", { shop: establishmentId, service: serviceId });
  finish(path, error || !data ? "falha" : "servico-excluido");
}

export async function moveService(establishmentId: string, serviceId: string, neighborId: string, step: -1 | 1, team: boolean) {
  if (!isUuid(establishmentId) || !isUuid(serviceId) || !isUuid(neighborId)) redirect("/painel");
  const path = `/${team ? "equipe" : "painel"}/${establishmentId}/servicos`;
  const supabase = await authenticated(path);
  const { data, error } = await supabase.rpc("barberflow_move_service", {
    shop: establishmentId, service: serviceId, neighbor: neighborId, step,
  });
  finish(path, error ? "falha" : data ? "servico-movido" : "ordem-alterada");
}
