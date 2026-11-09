"use server";

import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../lib/establishments";
import { slugPattern } from "../../../lib/public-booking";
import { supabaseServer } from "../../../lib/supabase";

export async function reportReview(slug: string, review: string, form: FormData) {
  if (!slugPattern.test(slug)) notFound();
  const path = `/estabelecimento/${slug}`;
  const reason = String(form.get("reason") ?? "").trim();
  if (!isUuid(review) || !reason || reason.length > 500) redirect(path + "?denuncia=erro#avaliacoes");
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) {
    redirect("/login?" + new URLSearchParams({ next: path + "#avaliacoes" }));
  }
  const { data, error } = await supabase.rpc("barberflow_report_review", { review, profile_slug: slug, report_reason: reason });
  redirect(path + "?denuncia=" + (!error && data === true ? "enviada" : "erro") + "#avaliacoes");
}
