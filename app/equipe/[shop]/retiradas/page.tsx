import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";

async function updatePickup(shop: string, order: string, operation: "ready" | "collected") {
  "use server";
  if (!isUuid(shop) || !isUuid(order)) notFound();
  const client = await supabaseServer();
  const { data } = await client?.rpc("barberflow_team_update_pickup", { shop, order_id: order, operation }) ?? {};
  redirect(`/equipe/${shop}/retiradas?estado=${data === true ? "salvo" : "falha"}`);
}

export default async function Pickups({ params, searchParams }: {
  params: Promise<{ shop: string }>; searchParams: Promise<{ estado?: string }>;
}) {
  const { shop } = await params;
  if (!isUuid(shop)) notFound();
  const client = await supabaseServer();
  if (!client || !(await client.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: `/equipe/${shop}/retiradas` }));
  const { data: allowed } = await client.rpc("barberflow_team_can_manage_products", { shop });
  if (allowed !== true) notFound();
  const { data, error } = await client.rpc("barberflow_team_pickups", { shop });
  const { estado } = await searchParams;
  const orders = (data ?? []) as { id: string; order_number: number; buyer_name: string; product_name: string; quantity: number; status: "paid" | "ready" }[];
  return <section className="container section">
    <Link className="secondary finance-tab command-action" data-tone="blue" href={`/equipe/${shop}/meu-painel`}>Voltar ao Meu dia</Link>
    <h1>Retiradas da vitrine</h1>
    {estado === "salvo" && <p role="status">Pedido atualizado.</p>}
    {estado === "falha" && <p role="alert">O pedido não pôde ser atualizado. Confira o estado atual.</p>}
    {error ? <p role="alert">Não foi possível consultar as retiradas.</p> : orders.length ? <ul className="cards">
      {orders.map(order => <li className="card" key={order.id}>
        <h2>Pedido {order.order_number} · {order.product_name}</h2>
        <p>{order.buyer_name} · {order.quantity} un.</p>
        <p>{order.status === "ready" ? "Pronto para retirada" : "Pagamento confirmado"}</p>
        <form action={updatePickup.bind(null, shop, order.id, order.status === "ready" ? "collected" : "ready")}>
          <SubmitButton tone="keep">{order.status === "ready" ? "Confirmar retirada" : "Marcar como pronto"}</SubmitButton>
        </form>
      </li>)}
    </ul> : <p>Nenhum pedido pago ou pronto para retirada.</p>}
  </section>;
}
