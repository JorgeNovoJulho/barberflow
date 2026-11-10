import QRCode from "qrcode";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "../../lib/supabase";
import { isUuid } from "../../lib/establishments";
import { bookingCurrency } from "../../lib/public-booking";
import { showcasePix } from "../../lib/pix";
import { formatShowcaseDate, showcaseStatus } from "../../lib/showcase";
import { CopyPix } from "../painel/[establishmentId]/assinatura/copy-pix";

type Purchase = Parameters<typeof showcasePix>[0] & {
  shop_name: string; product_name: string; quantity: number; unit_price_cents: number;
  status: keyof typeof showcaseStatus; created_at: string; expires_at: string;
};

export default async function Purchases({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?next=%2Fminhas-compras");
  const { pedido } = await searchParams;
  const selected = typeof pedido === "string" && isUuid(pedido) ? pedido : null;
  const fields = "id,shop_name,product_name,quantity,unit_price_cents,total_cents,status,created_at,expires_at,pix_key,merchant,city";
  const [result, focused] = await Promise.all([
    supabase.from("barberflow_showcase_orders").select(fields).eq("buyer_id", user.id).order("created_at", { ascending: false }).limit(100),
    selected ? supabase.from("barberflow_showcase_orders").select(fields).eq("buyer_id", user.id).eq("id", selected).maybeSingle() : null,
  ]);
  const purchases = (result.data ?? []) as Purchase[];
  const orders = focused?.data ? [focused.data as Purchase, ...purchases.filter(({ id }) => id !== selected)] : purchases;
  return <section className="container section">
    <p className="eyebrow">Área do cliente</p>
    <h1>Minhas compras</h1>
    <p>Acompanhe o pagamento e aguarde o status de retirada antes de ir ao estabelecimento.</p>
    {result.error || focused?.error ? <p role="alert">Não foi possível carregar todas as suas compras.</p> : null}
    {selected && !focused?.data && !focused?.error && <p role="status">Pedido indisponível na sua conta.</p>}
    {orders.length ? <ul className="cards">{await Promise.all(orders.map(async (order) => {
      const pending = order.status === "pending";
      const expired = pending && Date.parse(order.expires_at) <= Date.now();
      const pix = pending && !expired && user.email_confirmed_at && !user.is_anonymous ? showcasePix(order) : null;
      const qr = pix ? await QRCode.toDataURL(pix, { width: 240, margin: 4 }) : null;
      return <li className="card panel-form showcase-order" key={order.id} id={`pedido-${order.id}`}>
        <p className="eyebrow">{order.shop_name}</p>
        <h2>{order.product_name}</h2>
        <p><strong>{expired ? "Prazo da reserva encerrado" : showcaseStatus[order.status]}</strong></p>
        <p>{order.quantity} un. · {bookingCurrency.format(order.unit_price_cents / 100)} por unidade</p>
        <p><strong>Total {bookingCurrency.format(order.total_cents / 100)}</strong></p>
        <p><small>Pedido feito em {formatShowcaseDate(order.created_at)} · {order.id.slice(0, 8).toUpperCase()}</small></p>
        {pix && <details open={selected === order.id}>
          <summary>Pagar com Pix</summary>
          {qr && <img src={qr} alt="QR Code Pix para pagar este pedido" width={240} height={240} />}
          <p>Use o código no app do banco até {formatShowcaseDate(order.expires_at)}. Confira o destinatário e aguarde a conferência do estabelecimento.</p>
          <label className="showcase-pix-code">Código Pix
            <textarea readOnly value={pix} rows={4} spellCheck={false} />
          </label>
          <CopyPix value={pix} code />
        </details>}
        {expired && <p>Se você já pagou, fale com o estabelecimento e guarde o comprovante.</p>}
      </li>;
    }))}</ul> : !result.error && <p>Você ainda não tem compras. <Link href="/estabelecimentos">Encontrar estabelecimentos</Link></p>}
  </section>;
}
