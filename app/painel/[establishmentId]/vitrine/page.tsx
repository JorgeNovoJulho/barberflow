import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { pixTransactionId } from "../../../../lib/pix";
import { orderProductPhotos } from "../../../../lib/order-photos";
import { OrderCardHeading } from "../../../minhas-compras/order-card-heading";
import { formatShowcaseDate, showcaseStatus } from "../../../../lib/showcase";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { pageIndex } from "../../../cliente/social";
import { manageShowcaseOrder, updateShowcaseOrder } from "./actions";

const feedback: Record<string, string> = {
  negado: "Pedido negado. A reserva foi liberada e o comprador foi avisado.",
  nega_bloqueada: "Só é possível negar pedidos sem pagamento confirmado e sem QR do Asaas emitido ou em geração.",
  comanda_vinculada: "Vínculo da comanda atualizado.",
  comanda_invalida: "Comanda de balcão não encontrada neste estabelecimento.",
  pago: "Pix confirmado. Estoque e caixa atualizados. Aviso de separação registrado.",
  atualizado: "Pedido atualizado.",
  invalido: "Confira os campos preenchidos.",
  estoque: "Sem estoque disponível ou dentro da validade para concluir o pedido. Confira o pagamento e contate o cliente antes de prosseguir.",
  duplicado: "Esse identificador bancário já foi usado em outro pedido.",
  conferir: "Confira o valor creditado e o status do pedido.",
  falha: "Não foi possível salvar a alteração.",
};

type Order = { id: string; order_number: number; product_id: string; establishment_id: string; product_sku: string; buyer_name: string; product_name: string; quantity: number; total_cents: number;
  asaas_pix: boolean; status: keyof typeof showcaseStatus; created_at: string; expires_at: string; bank_reference: string | null; read_at: string | null; counter_number: string | null };

export default async function ShowcaseOrders({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>; searchParams: Promise<{ estado?: string; aba?: string; ordem?: string; de?: string; ate?: string; sku?: string; pedido?: string; comanda?: string; pagina?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: `/painel/${shop}/vitrine` }));
  const business = await supabase.from("barberflow_establishments").select("name")
    .eq("id", shop).eq("owner_id", user.id).maybeSingle();
  if (business.error) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!business.data) notFound();
  const args = await searchParams;
  const { estado } = args;
  const path = `/painel/${shop}/vitrine`;
  const tab = args.aba === "retirados" ? "retirados" : "pendentes";
  const ascending = args.ordem === "antigos";
  const page = pageIndex(args.pagina);
  const value = (input: string | undefined, limit: number) => typeof input === "string" ? input.trim().slice(0, limit) : "";
  const date = (input: string | undefined) => {
    const raw = value(input, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
    const time = new Date(raw + "T00:00:00Z");
    return Number.isFinite(+time) && time.toISOString().slice(0,10) === raw ? raw : "";
  };
  const from = date(args.de);
  const until = date(args.ate);
  const sku = value(args.sku, 60);
  const number = value(args.pedido, 16).replace(/^#/, "");
  const counter = value(args.comanda, 16);
  const invalid = (!!args.de && !from) || (!!args.ate && !until) || (!!from && !!until && from > until)
    || (!!number && (!/^\d+$/.test(number) || !Number.isSafeInteger(Number(number))))
    || (!!counter && !/^\d{3}\.\d{3}\.\d{4}$/.test(counter));
  const filters = (target = tab, index = page) => new URLSearchParams({
    aba: target, pagina: String(index), ordem: ascending ? "antigos" : "recentes", de: from, ate: until,
    sku, pedido: number, comanda: counter,
  }).toString();
  let listing = supabase.from("barberflow_showcase_orders")
    .select("id,order_number,product_id,establishment_id,product_sku,buyer_name,product_name,quantity,total_cents,status,created_at,expires_at,bank_reference,read_at,asaas_pix,counter_number")
    .eq("establishment_id", shop).in("status", tab === "retirados" ? ["collected"] : ["pending","paid","ready"]);
  if (from) listing = listing.gte("created_at", from + "T00:00:00-03:00");
  if (until) {
    const nextDay = new Date(Date.parse(until + "T00:00:00Z") + 86_400_000).toISOString().slice(0,10);
    listing = listing.lt("created_at", nextDay + "T00:00:00-03:00");
  }
  if (sku) listing = listing.ilike("product_sku", sku.replace(/[\\%_]/g, "\\$&"));
  if (number && !invalid) listing = listing.eq("order_number", Number(number));
  if (counter) listing = listing.eq("counter_number", counter);
  const orders = invalid ? null : await listing.order("created_at", { ascending }).order("id", { ascending }).range(page*30,page*30+30);
  const purchases = ((orders?.data ?? []) as Order[]).slice(0,30);
  const photos = await orderProductPhotos(supabase, purchases);
  function card(order: Order) {
    const expired = order.status === "pending" && Date.parse(order.expires_at) <= Date.now();
    return <li className="card showcase-order" data-order-status={expired ? "expired" : order.status} key={order.id}>
      <OrderCardHeading order={order} label={order.buyer_name + " · " + order.quantity + " un."}
        photo={photos.get(shop + "/" + order.product_id)} status={expired ? "Reserva encerrada" : showcaseStatus[order.status]} />
      <div className="order-card-body">
      {order.status === "paid" && !order.read_at && <p role="status">Novo pagamento confirmado. Separe o produto.</p>}
      <p><small>{formatShowcaseDate(order.created_at)} · {order.asaas_pix ? "Pix Asaas" : "Identificador Pix " + pixTransactionId(order.id)}</small></p>
      {order.counter_number && <p>Comanda de balcão {order.counter_number}</p>}
      <details>
        <summary>Vincular comanda de balcão</summary>
        <form className="account-form" action={manageShowcaseOrder.bind(null, shop, order.id, "link", filters())}>
          <label>Número da comanda <input name="counter" placeholder="000.001.2026" defaultValue={order.counter_number ?? ""} maxLength={12} /></label>
          <p>O vínculo serve para consulta. Deixe em branco para remover.</p>
          <SubmitButton>Salvar vínculo</SubmitButton>
        </form>
      </details>
      {order.status === "pending" && <details>
        <summary>Negar pedido</summary>
        <form className="account-form" action={manageShowcaseOrder.bind(null, shop, order.id, "deny", filters())}>
          <p>O pedido sai desta lista, a reserva é liberada e o comprador recebe um aviso. Confira o extrato antes de confirmar.</p>
          <label><input name="confirm" type="checkbox" required /> Confirmo que não recebi o Pix e quero negar o pedido.</label>
          <SubmitButton>Confirmar pedido negado</SubmitButton>
        </form>
      </details>}
      {order.bank_reference && <p>Referência bancária {order.bank_reference}</p>}
      {order.status === "pending" && <details>
        <summary>Confirmar Pix recebido</summary>
        <p>Localize o crédito e informe o valor e a referência bancária da transação. Para Pix Asaas, use a confirmação manual apenas se o retorno automático estiver indisponível e o crédito estiver confirmado.</p>
        <form className="account-form" action={updateShowcaseOrder.bind(null, shop, order.id, "confirm")}>
          <label>Valor creditado (R$) <input name="amount" inputMode="decimal" required /></label>
          <label>Referência bancária <input name="reference" minLength={6} maxLength={100} required /></label>
          <SubmitButton>Confirmar crédito e baixar estoque</SubmitButton>
        </form>
      </details>}
      {order.status === "paid" && <form action={updateShowcaseOrder.bind(null, shop, order.id, "ready")}>
        <SubmitButton>Marcar pronto para retirada</SubmitButton>
      </form>}
      {order.status === "paid" && !order.read_at && <form action={updateShowcaseOrder.bind(null, shop, order.id, "read")}>
        <button className="secondary" type="submit">Marcar aviso como lido</button>
      </form>}
      {order.status === "ready" && <form action={updateShowcaseOrder.bind(null, shop, order.id, "collected")}>
        <SubmitButton>Registrar retirada</SubmitButton>
      </form>}
      </div>
    </li>;
  }
  return <section className="section">
    <header className="operational-heading">
      <p className="eyebrow">{business.data.name}</p>
      <h1>Pedidos da vitrine</h1>
      <div className="account-links">
        <Link href={`/painel/${shop}/publicacao/previa`}>Ver prévia</Link>
        <Link href={`/painel/${shop}/estoque`}>Gerenciar produtos</Link>
      </div>
    </header>
    {estado && Object.hasOwn(feedback, estado) && <p role="status">{feedback[estado]}</p>}
    <section className="card panel-form">
      <h2>Pix da vitrine</h2>
      <p>As compras usam a conta Pix geral do estabelecimento.</p>
      <Link className="secondary" href={'/painel/' + shop + '/financeiro/pagamentos'}>Configurar recebimentos no Financeiro</Link>
    </section>
    <nav className="account-links" aria-label="Situação dos pedidos">
      <Link className="secondary" aria-current={tab === "pendentes" ? "page" : undefined} href={path + "?" + filters("pendentes",0)}>Pendentes de aprovação ou retirada</Link>
      <Link className="secondary" aria-current={tab === "retirados" ? "page" : undefined} href={path + "?" + filters("retirados",0)}>Confirmados e retirados</Link>
    </nav>
    <form className="card account-form panel-form" action={path}>
      <input type="hidden" name="aba" value={tab} />
      <label>Ordenar por <select name="ordem" defaultValue={ascending ? "antigos" : "recentes"}><option value="recentes">Mais recentes</option><option value="antigos">Mais antigos</option></select></label>
      <div className="form-columns"><label>Data inicial <input type="date" name="de" defaultValue={from} /></label><label>Data final <input type="date" name="ate" defaultValue={until} /></label></div>
      <div className="form-columns"><label>Código do produto (SKU) <input name="sku" defaultValue={sku} maxLength={60} /></label><label>Número do pedido <input name="pedido" defaultValue={number} inputMode="numeric" maxLength={16} /></label></div>
      <label>Número da comanda <input name="comanda" defaultValue={counter} placeholder="000.001.2026" maxLength={12} /></label>
      <button className="primary">Aplicar filtros</button>
    </form>
    {invalid ? <p role="alert">Confira o período e os números informados.</p>
      : orders?.error ? <p role="alert">Não foi possível carregar os pedidos.</p>
      : purchases.length ? <ul className="cards order-card-grid">{purchases.map(card)}</ul> : <p>Nenhum pedido encontrado.</p>}
    <nav className="account-links" aria-label="Páginas de pedidos">
      {page > 0 && <Link href={path + "?" + filters(tab,page-1)}>Anterior</Link>}
      {(orders?.data?.length ?? 0) > 30 && <Link href={path + "?" + filters(tab,page+1)}>Próxima</Link>}
    </nav>
  </section>;
}
