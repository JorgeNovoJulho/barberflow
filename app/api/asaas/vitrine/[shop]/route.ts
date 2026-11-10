import { isUuid } from "../../../../../lib/establishments";
import { authorizedShowcaseWebhook, settleShowcasePix } from "../../../../../lib/showcase-asaas";

export async function POST(request: Request, { params }: { params: Promise<{ shop: string }> }) {
  const { shop } = await params;
  if (!isUuid(shop) || !authorizedShowcaseWebhook(shop, request.headers.get("asaas-access-token"))) {
    return new Response(null, { status: 401 });
  }
  const event = await request.json().catch(() => null);
  if (!event) return new Response(null, { status: 400 });
  const { id, pixQrCodeId } = event.payment ?? {};
  if (event.event !== "PAYMENT_RECEIVED" || typeof id !== "string" || !/^pay_[a-z0-9]+$/i.test(id)
    || typeof pixQrCodeId !== "string" || !/^[a-z0-9_-]{6,100}$/i.test(pixQrCodeId)) {
    return Response.json({ received: true });
  }
  try {
    await settleShowcasePix(shop, pixQrCodeId, id);
    return Response.json({ received: true });
  } catch {
    return new Response(null, { status: 503 });
  }
}
