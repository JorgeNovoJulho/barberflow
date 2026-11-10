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
import { orderProductPhotos } from "../../lib/order-photos";
import { OrderCardHeading } from "./order-card-heading";
import { formatShowcaseDate, showcaseStatus } from "../../lib/showcase";
import { CopyPix } from "../painel/[establishmentId]/assinatura/copy-pix";

type Purchase = Parameters<typeof showcasePix>[0] & {
  order_number: number; product_id: string; establishment_id: string; product_sku: string; asaas_pix: boolean; shop_name: string; product_name: string; quantity: number; unit_price_cents: number;
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
  const fields = "id,order_number,product_id,establishment_id,product_sku,shop_name,product_name,quantity,unit_price_cents,total_cents,status,created_at,expires_at,pix_key,merchant,city,asaas_pix";
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
  const integratedOrders = orders.filter((order) => order.asaas_pix && order.status === "pending");
  const [photos, integratedPix] = await Promise.all([
    orderProductPhotos(supabase, orders),
    integratedOrders.length ? cardAdmin()?.from("barberflow_showcase_asaas")
      .select("order_id,payload").in("order_id", integratedOrders.map(({ id }) => id)) : null,
  ]);
  const pixByOrder = new Map((integratedPix?.data ?? []).map(({ order_id, payload }) => [order_id, payload as string | null]));
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
    {orders.some(({ status }) => status !== "collected") && <PurchaseUpdates />}
    {orders.length ? <ul className="cards order-card-grid">{await Promise.all(orders.map(async (order) => {
      const pending = order.status === "pending";
      const expired = pending && Date.parse(order.expires_at) <= Date.now();
      const pixExpired = order.asaas_pix && Date.parse(order.expires_at) - 60_000 <= Date.now();
      const paymentOpen = pending && !expired && !pixExpired && user.email_confirmed_at && !user.is_anonymous;
      const pix = paymentOpen ? order.asaas_pix ? pixByOrder.get(order.id) ?? null : showcasePix(order) : null;
      const qr = pix ? await QRCode.toDataURL(pix, { width: 240, margin: 4 }) : null;
      return <li className="card showcase-order" data-order-status={expired || (pending && pixExpired) ? "expired" : order.status} key={order.id} id={`pedido-${order.id}`}>
        <details open={selected === order.id}>
          <summary><OrderCardHeading order={order} label={order.shop_name} photo={photos.get(order.establishment_id + "/" + order.product_id)}
            status={expired || (pending && pixExpired) ? "Prazo do Pix encerrado" : showcaseStatus[order.status]} /></summary>
          <div className="order-card-body">
        {order.status === "ready" && <p data-feedback="success">Seu pedido está disponível para retirada. Apresente o número abaixo ao estabelecimento.</p>}
        <p>{order.quantity} un. · {bookingCurrency.format(order.unit_price_cents / 100)} por unidade</p>
        <p><small>Pedido feito em {formatShowcaseDate(order.created_at)}</small></p>
        {paymentOpen && order.asaas_pix && !pix && <form action={generatePurchasePix.bind(null, order.id)}>
          {pixFeedback === "aguarde" && <p role="alert">O código ainda não está disponível. Aguarde alguns segundos e tente novamente.</p>}
          <SubmitButton>Gerar QR Code Pix</SubmitButton>
        </form>}
        {pix && <section aria-label="Pagamento Pix">
          <h3>Pagar com Pix</h3>
          {qr && <img src={qr} alt="QR Code Pix para pagar este pedido" width={240} height={240} loading="lazy" />}
          <p>{order.asaas_pix
            ? "Confira o destinatário e pague assim que possível. A confirmação do Asaas será exibida nesta página."
            : <>Use o código no app do banco até {formatShowcaseDate(order.expires_at)}. Confira o destinatário. O estabelecimento confirma o crédito pelo extrato.</>}</p>
          <label className="showcase-pix-code">Código Pix
            <textarea readOnly value={pix} rows={4} spellCheck={false} />
          </label>
          <CopyPix value={pix} code />
        </section>}
        {pending && (expired || pixExpired) && <p>Se você já pagou, fale com o estabelecimento e guarde o comprovante.</p>}
          </div>
        </details>
      </li>;
    }))}</ul> : !result.error && !filterError && <p>Nenhuma compra encontrada com estes filtros. <Link href="/estabelecimentos">Encontrar estabelecimentos</Link></p>}
    {(page>0 || purchases.length>20) && <nav className="account-links" aria-label="Páginas de compras">{page>0 && <Link href={filters(page-1)}>Anterior</Link>}{purchases.length>20 && <Link href={filters(page+1)}>Próxima</Link>}</nav>}
  </section>;
}
