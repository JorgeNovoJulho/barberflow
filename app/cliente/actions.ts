"use server";

import { optimizeProfileImage } from "../../lib/profile-image";
import { profileImageLimit } from "../../lib/profile-image-limits";
import { revalidatePath } from "next/cache";
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

async function usernameAvailability(supabase: Session["supabase"], candidate: string) {
  const username = candidate.trim();
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) return { error: "Use de 3 a 40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado." };
  const { data, error } = await supabase.rpc("barberflow_username_availability", { candidate: username });
  if (error || !data) return { error: "Não foi possível verificar o nome agora." };
  return { available: data.available === true, suggestions: data.suggestions as string[] };
}

export async function checkSocialUsername(candidate: string) {
  const { supabase } = await socialSession();
  return usernameAvailability(supabase, candidate);
}

export async function saveSocialProfile(form: FormData) {
  const { supabase, user } = await socialSession();
  const username = String(form.get("username") ?? "").trim();
  const theme = String(form.get("theme") ?? "");
  const expected = String(form.get("revision") ?? "");
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username) || !["claro","rosa","verde","azul"].includes(theme)) {
    return { error: "Confira o nome de usuário e o tema." };
  }
  const links: Record<string,string> = {};
  for (const [network, hosts] of Object.entries(socials)) {
    const value = String(form.get(network) ?? "").trim();
    if (!value) continue;
    const url = value.length <= 300 && socialUrl(value, hosts);
    if (!url) return { error: "Confira o endereço de " + network + "." };
    links[network] = url;
  }
  const current = await supabase.from("barberflow_social_profiles").select("avatar,banner,revision").eq("user_id", user.id).maybeSingle();
  if (current.error) return { error: "Não foi possível carregar a versão atual do perfil." };
  const stale = { error: "O perfil mudou em outra sessão. Reabra o formulário para editar a versão mais recente.", stale: true };
  if (expected !== String(current.data?.revision ?? "new")) return stale;
  const availability = await usernameAvailability(supabase, username);
  if (availability.error) return { error: availability.error };
  if (!availability.available) return { error: "Este nome de usuário já está em uso.", suggestions: availability.suggestions };
  const uploaded: string[] = [];
  const media: { avatar?: string; banner?: string } = {};
  const bucket = supabase.storage.from(socialBucket);
  for (const key of ["avatar","banner"] as const) {
    const file = form.get(key);
    if (key === "banner" && form.get("remove_banner") === "on") media.banner = "";
    if (!(file instanceof File) || !file.size) continue;
    const label = key === "avatar" ? "a foto" : "o banner";
    if (file.size > profileImageLimit) {
      if (uploaded.length) await bucket.remove(uploaded);
      return { error: `Não foi possível enviar ${label}: o arquivo ultrapassa 10 MB.` };
    }
    let pixels: Buffer;
    try {
      pixels = await optimizeProfileImage(Buffer.from(await file.arrayBuffer()), key);
    } catch {
      if (uploaded.length) await bucket.remove(uploaded);
      return { error: `Não foi possível ler ${label}. Use JPG, PNG, WebP, AVIF, GIF ou BMP de 24 ou 32 bits sem compressão. Limite de 8192 pixels por lado e 40 megapixels.` };
    }
    const object = user.id + "/" + crypto.randomUUID();
    const { error } = await bucket.upload(object, pixels, { contentType: "image/webp" });
    if (error) {
      if (uploaded.length) await bucket.remove(uploaded);
      return { error: `O armazenamento não recebeu ${label}. Tente novamente. Sua imagem salva foi preservada.` };
    }
    uploaded.push(object);
    media[key] = object;
  }
  if (!(media.avatar || current.data?.avatar)) {
    if (uploaded.length) await bucket.remove(uploaded);
    return { error: "Selecione uma foto de perfil." };
  }
  const fields = { username, theme, links, ...media };
  const table = supabase.from("barberflow_social_profiles");
  const query = current.data ? table.update(fields).eq("user_id", user.id).eq("revision", current.data.revision) : table.insert(fields);
  const { error, data } = await query.select("user_id").maybeSingle();
  if (error || !data) {
    // Only discard new objects if the database definitively rejected the write.
    if (uploaded.length && (!error || /^[0-9A-Z]{5}$/.test(error.code ?? ""))) await bucket.remove(uploaded);
    if (error?.code === "23505") {
      const result = await usernameAvailability(supabase, username);
      return result.available ? stale : { error: "Este nome de usuário já está em uso.", suggestions: result.suggestions };
    }
    return !error ? stale : { error: "Não foi possível salvar o perfil. Tente novamente." };
  }
  const replaced = (["avatar","banner"] as const).flatMap(key =>
    media[key] !== undefined && current.data?.[key] ? [current.data[key]] : []);
  if (replaced.length) await bucket.remove(replaced);
  revalidatePath("/cliente");
  return { saved: true } as const;
}

export async function changeFavorite(path: string, shop: string, favorite: boolean) {
  const { supabase, user } = await socialSession();
  if (!isUuid(shop)) finish(path, false);
  const table = supabase.from("barberflow_social_favorite_shops");
  const { error } = await (favorite ? table.delete().eq("follower", user.id).eq("shop", shop) : table.insert({ shop }));
  finish(path, !error || error.code === "23505");
}

export async function blockSocialProfile(subject: string, blocked: boolean) {
  const { supabase } = await socialSession();
  if (!isUuid(subject)) finish("/cliente", false);
  const { data, error } = await supabase.rpc("barberflow_block_profile", { subject, blocked });
  finish("/cliente?aba=bloqueados", !error && data === true);
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
