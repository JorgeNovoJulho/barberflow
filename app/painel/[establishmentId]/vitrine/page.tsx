import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { pixTransactionId } from "../../../../lib/pix";
import { bookingCurrency } from "../../../../lib/public-booking";
import { formatShowcaseDate, showcaseOrderNumber, showcaseStatus } from "../../../../lib/showcase";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { updateShowcaseOrder } from "./actions";

const feedback: Record<string, string> = {
  pago: "Pix confirmado. Estoque e caixa atualizados. Aviso de separação registrado.",
  atualizado: "Pedido atualizado.",
  invalido: "Confira os campos preenchidos.",
  estoque: "Sem estoque disponível ou dentro da validade para concluir o pedido. Confira o pagamento e contate o cliente antes de prosseguir.",
  duplicado: "Esse identificador bancário já foi usado em outro pedido.",
  conferir: "Confira o valor creditado e o status do pedido.",
  falha: "Não foi possível salvar a alteração.",
};

type Order = { id: string; buyer_name: string; product_name: string; quantity: number; total_cents: number;
  asaas_pix: boolean; status: keyof typeof showcaseStatus; created_at: string; expires_at: string; bank_reference: string | null; read_at: string | null };

export default async function ShowcaseOrders({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>; searchParams: Promise<{ estado?: string }>;
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
  const orders = await supabase.from("barberflow_showcase_orders")
      .select("id,buyer_name,product_name,quantity,total_cents,status,created_at,expires_at,bank_reference,read_at,asaas_pix")
      .eq("establishment_id", shop).order("created_at", { ascending: false }).limit(100);
  const { estado } = await searchParams;
  const purchases = (orders.data ?? []) as Order[];
  const needsSeparation = purchases.filter((order) => order.status === "paid");
  const remaining = purchases.filter((order) => order.status !== "paid");
  function card(order: Order) {
    const expired = order.status === "pending" && Date.parse(order.expires_at) <= Date.now();
    return <li className="card panel-form showcase-order" key={order.id}>
      <h3>{order.product_name}</h3>
      <p>{order.buyer_name} · {order.quantity} un. · <strong>{bookingCurrency.format(order.total_cents / 100)}</strong></p>
      <p><strong>{expired ? "Reserva encerrada · conferir se houve crédito" : showcaseStatus[order.status]}</strong></p>
      {order.status === "paid" && !order.read_at && <p role="status">Novo pagamento confirmado. Separe o produto.</p>}
      <p>Número do pedido <code className="showcase-order-number">{showcaseOrderNumber(order.id)}</code></p>
      <p><small>{formatShowcaseDate(order.created_at)} · {order.asaas_pix ? "Pix Asaas" : "Identificador Pix " + pixTransactionId(order.id)}</small></p>
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
    <h2>Pagos para separar</h2>
    {orders.error ? <p role="alert">Não foi possível carregar os pedidos.</p>
      : needsSeparation.length ? <ul className="cards">{needsSeparation.map(card)}</ul> : <p>Nenhum pedido para separar.</p>}
    <h2>Outros pedidos</h2>
    {remaining.length ? <ul className="cards">{remaining.map(card)}</ul> : !orders.error && <p>Nenhum outro pedido.</p>}
  </section>;
}
