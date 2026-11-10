import QRCode from "qrcode";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "../../lib/supabase";
import { pageIndex } from "../cliente/social";
import { isUuid, parsePrice } from "../../lib/establishments";
import { bookingCurrency } from "../../lib/public-booking";
import { showcasePix } from "../../lib/pix";
import { cardAdmin } from "../../lib/card-payments";
import { SubmitButton } from "../auth/submit";
import { generatePurchasePix } from "./actions";
import { PurchaseUpdates } from "./purchase-updates";
import { formatShowcaseDate, showcaseOrderNumber, showcaseStatus } from "../../lib/showcase";
import { CopyPix } from "../painel/[establishmentId]/assinatura/copy-pix";

type Purchase = Parameters<typeof showcasePix>[0] & {
  asaas_pix: boolean; shop_name: string; product_name: string; quantity: number; unit_price_cents: number;
  status: keyof typeof showcaseStatus; created_at: string; expires_at: string;
};

export default async function Purchases({ searchParams }: { searchParams: Promise<{ pedido?: string; pix?: string; pagina?: string; loja?: string; de?: string; ate?: string; minimo?: string; maximo?: string }> }) {
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?next=%2Fminhas-compras");
  const { pedido, pix: pixFeedback, pagina, loja, de, ate, minimo, maximo } = await searchParams;
  const page = pageIndex(pagina);
  const store = typeof loja === "string" ? loja.trim().slice(0,120) : "";
  const date = (value:string|undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const parsed = new Date(value + "T00:00:00Z");
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0,10)===value ? value : "";
  };
  const from = date(de);
  const to = date(ate);
  const min = typeof minimo==="string" ? parsePrice(minimo) : null;
  const max = typeof maximo==="string" ? parsePrice(maximo) : null;
  const filterError = (!!minimo && min===null) || (!!maximo && max===null) || (min!==null && max!==null && min>max)
    || (!!de && !from) || (!!ate && !to) || (!!from && !!to && from>to);
  const filters = (index:number) => "?" + new URLSearchParams({ pagina:String(index),loja:store,de:from,ate:to,minimo:minimo ?? "",maximo:maximo ?? "" });
  const selected = typeof pedido === "string" && isUuid(pedido) ? pedido : null;
  const fields = "id,shop_name,product_name,quantity,unit_price_cents,total_cents,status,created_at,expires_at,pix_key,merchant,city,asaas_pix";
  let listing = supabase.from("barberflow_showcase_orders").select(fields).eq("buyer_id",user.id);
  if (store) listing = listing.ilike("shop_name","%"+store.replace(/[\\%_]/g,"\\$&")+"%");
  if (from) listing = listing.gte("created_at",from+"T00:00:00-03:00");
  if (to) {
    const tomorrow = new Date(Date.parse(to+"T00:00:00Z")+86400000).toISOString().slice(0,10);
    listing = listing.lt("created_at",tomorrow+"T00:00:00-03:00");
  }
  if (min!==null) listing = listing.gte("total_cents",min);
  if (max!==null) listing = listing.lte("total_cents",max);
  const [result, focused] = await Promise.all([
    filterError ? { data:[],error:null } : listing.order("created_at",{ ascending:false }).order("id").range(page*20,page*20+20),
    selected ? supabase.from("barberflow_showcase_orders").select(fields).eq("buyer_id", user.id).eq("id", selected).maybeSingle() : null,
  ]);
  const purchases = (result.data ?? []) as Purchase[];
  const visible = purchases.slice(0,20);
  const orders = focused?.data ? [focused.data as Purchase, ...visible.filter(({ id }) => id !== selected)] : visible;
  const integratedOrder = orders.find((order) => order.id === selected && order.asaas_pix && order.status === "pending");
  const integratedPix = integratedOrder ? await cardAdmin()?.from("barberflow_showcase_asaas")
    .select("payload").eq("order_id", integratedOrder.id).maybeSingle() : null;
  return <section className="container section">
    <p className="eyebrow">Área do cliente</p>
    <h1>Minhas compras</h1>
    <p>Acompanhe o pagamento e aguarde o status de retirada antes de ir ao estabelecimento.</p>
    <form action="/minhas-compras" className="account-form card panel-form">
      <label>Estabelecimento <input name="loja" maxLength={120} defaultValue={store} /></label>
      <div className="form-columns"><label>De <input type="date" name="de" defaultValue={from} /></label><label>Até <input type="date" name="ate" defaultValue={to} /></label></div>
      <div className="form-columns"><label>Preço mínimo do pedido (R$) <input name="minimo" inputMode="decimal" defaultValue={minimo} /></label><label>Preço máximo (R$) <input name="maximo" inputMode="decimal" defaultValue={maximo} /></label></div>
      <button className="primary">Filtrar compras</button>
    </form>
    {filterError && <p role="alert">Confira os intervalos de datas e preços.</p>}
    {result.error || focused?.error ? <p role="alert">Não foi possível carregar todas as suas compras.</p> : null}
    {selected && !focused?.data && !focused?.error && <p role="status">Pedido indisponível na sua conta.</p>}
    {orders.some(({ status }) => status === "pending" || status === "paid") && <PurchaseUpdates />}
    {orders.length ? <ul className="cards">{await Promise.all(orders.map(async (order) => {
      const pending = order.status === "pending";
      const expired = pending && Date.parse(order.expires_at) <= Date.now();
      const pixExpired = order.asaas_pix && Date.parse(order.expires_at) - 60_000 <= Date.now();
      const paymentOpen = selected === order.id && pending && !expired && !pixExpired && user.email_confirmed_at && !user.is_anonymous;
      const pix = paymentOpen ? order.asaas_pix ? integratedPix?.data?.payload ?? null : showcasePix(order) : null;
      const qr = pix ? await QRCode.toDataURL(pix, { width: 240, margin: 4 }) : null;
      return <li className="card panel-form showcase-order" key={order.id} id={`pedido-${order.id}`}>
        <p className="eyebrow">{order.shop_name}</p>
        <h2>{order.product_name}</h2>
        <p role="status" aria-atomic="true"><strong>{expired ? "Prazo da reserva encerrado" : showcaseStatus[order.status]}</strong></p>
        {order.status === "ready" && <p data-feedback="success">Seu pedido está disponível para retirada. Apresente o número abaixo ao estabelecimento.</p>}
        <p>{order.quantity} un. · {bookingCurrency.format(order.unit_price_cents / 100)} por unidade</p>
        <p><strong>Total {bookingCurrency.format(order.total_cents / 100)}</strong></p>
        <p><small>Pedido feito em {formatShowcaseDate(order.created_at)} · Número do pedido <code className="showcase-order-number">{showcaseOrderNumber(order.id)}</code></small></p>
        {pending && !expired && selected !== order.id && <Link href={filters(page)+"&pedido="+order.id+"#pedido-"+order.id}>Abrir pagamento Pix</Link>}
        {paymentOpen && order.asaas_pix && !pix && <form action={generatePurchasePix.bind(null, order.id)}>
          {pixFeedback === "aguarde" && <p role="alert">O código ainda não está disponível. Aguarde alguns segundos e tente novamente.</p>}
          <SubmitButton>Gerar QR Code Pix</SubmitButton>
        </form>}
        {pix && <details open={selected === order.id}>
          <summary>Pagar com Pix</summary>
          {qr && <img src={qr} alt="QR Code Pix para pagar este pedido" width={240} height={240} />}
          <p>{order.asaas_pix
            ? "Confira o destinatário e pague assim que possível. A confirmação do Asaas será exibida nesta página."
            : <>Use o código no app do banco até {formatShowcaseDate(order.expires_at)}. Confira o destinatário. O estabelecimento confirma o crédito pelo extrato.</>}</p>
          <label className="showcase-pix-code">Código Pix
            <textarea readOnly value={pix} rows={4} spellCheck={false} />
          </label>
          <CopyPix value={pix} code />
        </details>}
        {pending && (expired || pixExpired) && <p>Se você já pagou, fale com o estabelecimento e guarde o comprovante.</p>}
      </li>;
    }))}</ul> : !result.error && !filterError && <p>Nenhuma compra encontrada com estes filtros. <Link href="/estabelecimentos">Encontrar estabelecimentos</Link></p>}
    {(page>0 || purchases.length>20) && <nav className="account-links" aria-label="Páginas de compras">{page>0 && <Link href={filters(page-1)}>Anterior</Link>}{purchases.length>20 && <Link href={filters(page+1)}>Próxima</Link>}</nav>}
  </section>;
}
