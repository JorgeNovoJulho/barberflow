"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "../../../lib/establishments";
import { requireMaster } from "../../../lib/master";

export async function moderateReview(review: string, decision: "hide" | "restore" | "dismiss") {
  const supabase = await requireMaster();
  const path = "/gestao-master/avaliacoes";
  if (!isUuid(review) || !["hide", "restore", "dismiss"].includes(decision)) redirect(path + "?estado=erro");
  const { data, error } = await supabase.rpc("barberflow_moderate_review", { review, decision });
  if (error || data !== true) redirect(path + "?estado=erro");
  revalidatePath("/estabelecimento/[slug]", "page");
  revalidatePath(path);
  redirect(path + "?estado=salvo");
}
