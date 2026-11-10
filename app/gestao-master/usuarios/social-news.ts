"use server";

import { redirect } from "next/navigation";
import { requireMaster } from "../../../lib/master";
import { isUuid } from "../../../lib/establishments";

const path = "/gestao-master/usuarios";
function done(ok:boolean):never {
  redirect(path+"?estado="+(ok ? "noticia-ok" : "noticia-falha")+"#noticias");
}

export async function publishSocialNews(form:FormData) {
  const supabase = await requireMaster(path);
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!title || title.length>120 || !body || body.length>1000) done(false);
  const {error} = await supabase.from("barberflow_social_news").insert({title,body});
  done(!error);
}

export async function removeSocialNews(id:string) {
  const supabase = await requireMaster(path);
  if (!isUuid(id)) done(false);
  const {error} = await supabase.from("barberflow_social_news").delete().eq("id",id);
  done(!error);
}
