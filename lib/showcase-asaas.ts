import "server-only";
import { isPixPayload } from "./pix";

import { createHmac, timingSafeEqual } from "node:crypto";
import { asaas, cardAdmin, openCardToken } from "./card-payments";

export function showcaseWebhookToken(shop: string) {
  const secret = process.env.BARBERFLOW_PAYMENT_SECRET ?? "";
  return /^[a-f0-9]{64}$/i.test(secret)
    ? createHmac("sha256", Buffer.from(secret, "hex")).update("showcase-asaas:" + shop).digest("hex")
    : null;
}

export function authorizedShowcaseWebhook(shop: string, token: string | null) {
  const expected = showcaseWebhookToken(shop);
  return expected && token && /^[a-f0-9]{64}$/.test(token)
    && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function pixPayload(value: string) {
  value = value.trim();
  const payload = value.startsWith("000201") ? value : Buffer.from(value, "base64").toString("utf8").trim();
  if (!isPixPayload(payload)) {
    throw new Error("Invalid Asaas Pix payload");
  }
  return payload;
}

export async function issueShowcasePix(order: {
  id: string; establishment_id: string; expires_at: string; total_cents: number; pix_key: string;
}) {
  const admin = cardAdmin();
  const seconds = Math.floor((Date.parse(order.expires_at) - Date.now()) / 1000) - 60;
  if (!admin || seconds < 60) return false;
  const claimedAt = new Date().toISOString();
  const stale = new Date(Date.now() - 30_000).toISOString();
  const { data } = await admin.from("barberflow_showcase_asaas").update({ claimed_at: claimedAt })
    .eq("order_id", order.id).is("qr_id", null)
    .or("claimed_at.is.null,claimed_at.lt." + stale).select("sealed_token").maybeSingle();
  if (!data) return false;
  try {
    const token = openCardToken(order.establishment_id, data.sealed_token.slice(6));
    const result = await asaas<{ id: string; payload: string }>(token, false, "/pix/qrCodes/static", {
      addressKey: order.pix_key,
      value: order.total_cents / 100,
      format: "PAYLOAD",
      expirationSeconds: seconds,
      allowsMultiplePayments: false,
      externalReference: order.id,
    });
    if (!/^[a-z0-9_-]{6,100}$/i.test(result.id)) throw new Error("Invalid Asaas QR identifier");
    const { data: saved, error } = await admin.from("barberflow_showcase_asaas")
      .update({ qr_id: result.id, payload: pixPayload(result.payload) })
      .eq("order_id", order.id).eq("claimed_at", claimedAt).is("qr_id", null).select("order_id").maybeSingle();
    return !error && !!saved;
  } catch {
    return false;
  }
}

export async function settleShowcasePix(shop: string, qr: string, payment: string) {
  const admin = cardAdmin();
  if (!admin) throw new Error("Asaas configuration unavailable");
  const charge = await admin.from("barberflow_showcase_asaas").select("order_id,sealed_token").eq("qr_id", qr).maybeSingle();
  if (charge.error) throw charge.error;
  if (!charge.data) return;
  const order = await admin.from("barberflow_showcase_orders").select("total_cents,status")
    .eq("id", charge.data.order_id).eq("establishment_id", shop).maybeSingle();
  if (order.error) throw order.error;
  if (!order.data || order.data.status !== "pending") return;
  const token = openCardToken(shop, charge.data.sealed_token.slice(6));
  const confirmed = await asaas<{ id: string; pixQrCodeId?: string; value: number; status: string; billingType: string; deleted?: boolean }>(
    token, false, "/payments/" + encodeURIComponent(payment));
  const cents = Math.round(confirmed.value * 100);
  if (confirmed.id !== payment || confirmed.pixQrCodeId !== qr || confirmed.status !== "RECEIVED"
    || confirmed.billingType !== "PIX" || confirmed.deleted || cents !== order.data.total_cents) {
    throw new Error("Asaas payment differs from order");
  }
  const result = await admin.rpc("barberflow_settle_showcase_asaas", { qr, payment, cents });
  if (result.error || result.data !== true) throw new Error("Pix settlement requires reconciliation");
}
