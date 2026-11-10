"use server";

import { redirect } from "next/navigation";
import { isUuid } from "../../lib/establishments";
import { socialUrl } from "../../lib/business-profile";
import { localPath } from "../../lib/auth-path";
import { productImageTypes } from "../../lib/product-media";
import { socialBucket, socialSession, socials } from "./social";

type Session = Awaited<ReturnType<typeof socialSession>>;

function finish(path: string, ok: boolean): never {
  const url = new URL(localPath(path, "/cliente"), "https://barberflow.invalid");
  url.searchParams.set("estado", ok ? "salvo" : "falha");
  redirect(url.pathname + url.search + url.hash);
}

async function upload(session: Session, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || !file.size) return "";
  if (file.size > 2097152 || !productImageTypes.includes(file.type)) throw new Error("Formato ou tamanho inválido.");
  const path = session.user.id + "/" + crypto.randomUUID();
  const { error } = await session.supabase.storage.from(socialBucket).upload(path, file, { contentType: file.type });
  if (error) throw new Error("Falha no envio.");
  return path;
}

export async function saveSocialProfile(form: FormData) {
  const session = await socialSession();
  const { supabase, user } = session;
  const path = "/cliente?aba=perfil";
  const username = String(form.get("username") ?? "").trim();
  const theme = String(form.get("theme") ?? "");
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username) || !["claro","rosa","verde","azul"].includes(theme)) finish(path, false);
  const links: Record<string,string> = {};
  for (const [network, hosts] of Object.entries(socials)) {
    const value = String(form.get(network) ?? "").trim();
    if (!value) continue;
    const url = value.length <= 300 && socialUrl(value, hosts);
    if (!url) finish(path, false);
    links[network] = url;
  }
  const current = await supabase.from("barberflow_social_profiles").select("avatar,banner").eq("user_id", user.id).maybeSingle();
  if (current.error) finish(path, false);
  const uploaded: string[] = [];
  const replaced: string[] = [];
  const media: { avatar?: string; banner?: string } = {};
  try {
    for (const key of ["avatar","banner"] as const) {
      const object = await upload(session, form.get(key));
      if (object) uploaded.push(object);
      if (object || form.get("remove_" + key) === "on") {
        media[key] = object;
        if (current.data?.[key]) replaced.push(current.data[key]);
      }
    }
  } catch {
    if (uploaded.length) await supabase.storage.from(socialBucket).remove(uploaded);
    finish(path, false);
  }
  const fields = { username, theme, links, ...media };
  const query = current.data ? supabase.from("barberflow_social_profiles").update(fields).eq("user_id", user.id)
    : supabase.from("barberflow_social_profiles").insert(fields);
  const { error, data } = await query.select("user_id").maybeSingle();
  const clean = error || !data ? uploaded : replaced;
  if (clean.length) await supabase.storage.from(socialBucket).remove(clean);
  finish(path, !error && !!data);
}

export async function freezeSocial(frozen: boolean) {
  const { supabase,user } = await socialSession();
  const { error,data } = await supabase.from("barberflow_social_profiles").update({ frozen }).eq("user_id",user.id).select("user_id").maybeSingle();
  finish("/cliente?aba=perfil", !error && !!data);
}

export async function requestDeletion(form: FormData) {
  const { supabase } = await socialSession();
  if (form.get("confirm") !== "on") finish("/cliente?aba=perfil", false);
  const { error } = await supabase.from("barberflow_account_deletion_requests").insert({});
  finish("/cliente?aba=perfil", !error || error.code === "23505");
}

export async function saveSocialPhoto(path: string, shop: string | null, photo: string | null, form: FormData) {
  const session = await socialSession();
  const { supabase, user } = session;
  const caption = String(form.get("caption") ?? "").trim();
  const audience = String(form.get("audience") ?? "");
  if ((shop && !isUuid(shop)) || (photo && !isUuid(photo)) || caption.length > 500 || !["public","followers","private"].includes(audience)) finish(path, false);
  const table = supabase.from("barberflow_social_photos");
  const current = photo ? await table.select("object_path").eq("id",photo).eq("author",user.id).maybeSingle() : null;
  if (photo && !current?.data) finish(path,false);
  let object: string;
  try { object = await upload(session,form.get("photo")); } catch { finish(path,false); }
  if (photo && current?.data) {
    const { error,data } = await table.update({ caption,audience,...(object ? { object_path:object } : {}) })
      .eq("id",photo).eq("author",user.id).eq("object_path",current.data.object_path).select("id").maybeSingle();
    if (object) await supabase.storage.from(socialBucket).remove([error || !data ? object : current.data.object_path]);
    finish(path,!error && !!data);
  }
  if (!object) finish(path,false);
  const { error } = await supabase.from("barberflow_social_photos").insert({ shop,object_path:object,caption,audience,promotion:!!shop && form.get("promotion")==="on" });
  if (error) await supabase.storage.from(socialBucket).remove([object]);
  finish(path,!error);
}

export async function deleteSocialPhoto(path: string, photo: string, form: FormData) {
  const { supabase,user } = await socialSession();
  if (!isUuid(photo) || form.get("confirm") !== "on") finish(path,false);
  const { data,error } = await supabase.from("barberflow_social_photos").delete().eq("id",photo).eq("author",user.id).select("object_path").maybeSingle();
  if (data) await supabase.storage.from(socialBucket).remove([data.object_path]);
  finish(path,!error && !!data);
}

export async function changeFollow(path: string, target: string, shop: boolean, following: boolean) {
  const { supabase,user } = await socialSession();
  if (!isUuid(target)) finish(path,false);
  const table = supabase.from(shop ? "barberflow_social_follow_shops" : "barberflow_social_follow_users");
  const query = following ? table.delete().eq("follower",user.id).eq(shop ? "shop" : "target",target)
    : table.insert(shop ? { shop:target } : { target });
  const { error } = await query;
  finish(path,!error || error.code === "23505");
}

export async function changeLike(path: string, photo: string, liked: boolean) {
  const { supabase,user } = await socialSession();
  if (!isUuid(photo)) finish(path,false);
  const table = supabase.from("barberflow_social_likes");
  const { error } = await (liked ? table.delete().eq("photo",photo).eq("actor",user.id) : table.insert({ photo }));
  finish(path,!error || error.code === "23505");
}

export async function commentPhoto(path: string, photo: string, parent: string | null, form: FormData) {
  const { supabase } = await socialSession();
  const body = String(form.get("body") ?? "").trim();
  if (!isUuid(photo) || (parent && !isUuid(parent)) || !body || body.length>500) finish(path,false);
  const { error } = await supabase.from("barberflow_social_comments").insert({ photo,parent,body });
  finish(path,!error);
}

export async function reviewSocialShop(shop: string, form: FormData) {
  const { supabase } = await socialSession();
  const stars = String(form.get("stars") ?? "");
  const message = String(form.get("message") ?? "").trim();
  if (!isUuid(shop) || !/^[0-5]$/.test(stars) || message.length>500) finish("/cliente",false);
  const { data,error } = await supabase.rpc("barberflow_social_review",{ shop_id:shop,stars:Number(stars),message });
  finish("/cliente?loja="+shop,!error && data===true);
}
