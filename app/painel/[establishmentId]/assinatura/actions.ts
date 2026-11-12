"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { subscriptionProofBucket } from "../../../../lib/subscription-checkout";
import { isPlanPeriod, isPlanTier } from "../../../../lib/subscriptions";
import { supabaseServer } from "../../../../lib/supabase";

async function subscriptionContext(shop: string) {
  if (!isUuid(shop)) redirect("/painel");
  const path = `/painel/${shop}/assinatura`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  return { supabase, path };
}

export async function issueSubscriptionPix(shop: string, form: FormData) {
  const { supabase, path } = await subscriptionContext(shop);
  const [tier, period] = String(form.get("option") ?? "").split(":");
  if (!isPlanTier(tier) || !isPlanPeriod(period)) redirect(path + "?estado=pix-falha");
  const { data, error } = await supabase.rpc("barberflow_issue_subscription_pix", {
    shop, selected_period: period, selected_plan: tier,
  });
  if (error || !data) redirect(path + "?estado=pix-falha");
  redirect(path + "?cobranca=" + data + "#pix-" + data);
}

export async function sendSubscriptionProof(shop: string, charge: string, form: FormData) {
  const { supabase, path } = await subscriptionContext(shop);
  if (!isUuid(charge)) redirect(path + "?estado=envio-falha");
  const file = form.get("proof");
  const invalid = () => redirect(path + "?estado=arquivo-invalido&comprovante=" + charge + "#pix-" + charge);
  if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) return invalid();
  const header = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const signatures = [
    { ext: "pdf", mime: "application/pdf", matches: header.subarray(0, 5).toString() === "%PDF-" },
    { ext: "jpg", mime: "image/jpeg", matches: header.subarray(0, 3).toString("hex") === "ffd8ff" },
    { ext: "png", mime: "image/png", matches: header.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" },
    { ext: "bmp", mime: "image/bmp", matches: header.length >= 14 && header.subarray(0, 2).toString() === "BM" },
    { ext: "webp", mime: "image/webp", matches: header.subarray(0, 4).toString() === "RIFF" && header.subarray(8, 12).toString() === "WEBP" },
  ];
  const format = signatures.find(({ matches }) => matches);
  if (!format) return invalid();
  const objectPath = `${shop}/${charge}/${randomUUID()}.${format.ext}`;
  const { error: uploadError } = await supabase.storage.from(subscriptionProofBucket).upload(objectPath, file, { contentType: format.mime });
  if (uploadError) redirect(path + "?estado=envio-falha#pix-" + charge);
  const { data, error } = await supabase.rpc("barberflow_submit_subscription_proof", { shop, charge, object_path: objectPath });
  redirect(path + "?estado=" + (error || !data ? "envio-falha" : "enviado") + "#pix-" + charge);
}
