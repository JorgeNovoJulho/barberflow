import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscriptionProofBucket } from "./subscription-checkout";

export async function storeSubscriptionProof(client: SupabaseClient, shop: string, charge: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) return "arquivo-invalido";
  const header = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const signatures = [
    { ext: "pdf", mime: "application/pdf", matches: header.subarray(0, 5).toString() === "%PDF-" },
    { ext: "jpg", mime: "image/jpeg", matches: header.subarray(0, 3).toString("hex") === "ffd8ff" },
    { ext: "png", mime: "image/png", matches: header.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" },
    { ext: "bmp", mime: "image/bmp", matches: header.length >= 14 && header.subarray(0, 2).toString() === "BM" },
    { ext: "webp", mime: "image/webp", matches: header.subarray(0, 4).toString() === "RIFF" && header.subarray(8, 12).toString() === "WEBP" },
  ];
  const format = signatures.find(item => item.matches);
  if (!format) return "arquivo-invalido";
  const objectPath = `${shop}/${charge}/${randomUUID()}.${format.ext}`;
  const { error: uploadError } = await client.storage.from(subscriptionProofBucket).upload(objectPath, file, { contentType: format.mime });
  if (uploadError) return "envio-falha";
  const { data, error } = await client.rpc("barberflow_submit_subscription_proof", { shop, charge, object_path: objectPath });
  return error || !data ? "envio-falha" : "enviado";
}
