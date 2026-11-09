import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { adjustStock, saveProduct } from "./actions";
import { StockFeedback } from "./feedback";
import { offsetDay, saoPauloToday } from "../../../../lib/agenda";

type Product = { id: string; name: string; sku: string; price_cents: number; stock: number; active: boolean; cost_cents: number | null; minimum_stock: number; expires_on: string | null };

function priceInput(cents: number | null | undefined) {
  return cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

function alerts(product: Product, today: string, cutoff: string) {
  if (!product.active) return [];
  const result: string[] = [];
  if (product.stock <= product.minimum_stock) result.push(product.stock === 0 ? "Sem estoque" : "Estoque no mínimo ou abaixo");
  if (product.expires_on && product.stock > 0) {
    if (product.expires_on < today) result.push("Validade vencida");
    else if (product.expires_on === today) result.push("Vence hoje");
    else if (product.expires_on <= cutoff) result.push("Validade próxima");
  }
  return result;
}

function ProductForm({ shop, product }: { shop: string; product?: Product }) {
  return <form className="account-form" action={saveProduct.bind(null, shop, product?.id ?? null)}>
    <label>Nome <input name="name" maxLength={120} required defaultValue={product?.name} /></label>
    <label>Código do produto (SKU) <input name="sku" maxLength={60} defaultValue={product?.sku} /></label>
    <label>Preço de venda (R$) <input name="price" inputMode="decimal" required defaultValue={priceInput(product?.price_cents)} /></label>
    <label>Custo unitário (R$) <input name="cost" inputMode="decimal" defaultValue={priceInput(product?.cost_cents)} /></label>
    {!product && <label>Quantidade inicial <input name="initial" type="number" min={0} max={1000000} defaultValue={0} required /></label>}
    <label>Estoque mínimo <input name="minimum" type="number" min={0} max={1000000} defaultValue={product?.minimum_stock ?? 0} required /></label>
    <label>Data de validade <input name="expiry" type="date" defaultValue={product?.expires_on ?? ""} /></label>
    {product && <label><input name="active" type="checkbox" defaultChecked={product.active} /> Produto à venda</label>}
    <SubmitButton>Salvar produto</SubmitButton>
  </form>;
}

export default async function Stock({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: `/painel/${shop}/estoque` }));
  const { data: business, error } = await supabase.from("barberflow_establishments").select("name").eq("id", shop).maybeSingle();
  if (error) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!business) notFound();
  const [products, movements] = await Promise.all([
    supabase.from("barberflow_products").select("id,name,sku,price_cents,stock,active,cost_cents,minimum_stock,expires_on").eq("establishment_id", shop).order("name"),
    supabase.from("barberflow_stock_movements").select("id,product_id,delta,reason,created_at").eq("establishment_id", shop).order("created_at", { ascending: false }).limit(30),
  ]);
  const { estado } = await searchParams;
  const today = saoPauloToday();
  const cutoff = offsetDay(today, 30);
  const flagged = (products.data ?? []).map((product: Product) => ({ product, warnings: alerts(product, today, cutoff) }))
    .filter(({ warnings }) => warnings.length > 0);
  return <section className="container section">
    <nav className="account-links" aria-label="Estabelecimento">
      <Link href="/painel">Meus estabelecimentos</Link><Link href={`/painel/${shop}/agenda`}>Agenda</Link>
    </nav>
    <p className="eyebrow">{business.name}</p><h1>Estoque</h1>
    <StockFeedback status={estado} />
    {products.error || movements.error ? <p role="alert">Não foi possível carregar o estoque.</p> : <>
      <details className="card panel-form"><summary>Novo produto</summary><ProductForm shop={shop} /></details>
      {flagged.length > 0 && <section className="card panel-form stock-alerts" aria-labelledby="stock-alerts-title">
        <h2 id="stock-alerts-title">Alertas de estoque e validade</h2>
        <ul>{flagged.map(({ product, warnings }) => <li key={product.id}>
          <a href={`#produto-${product.id}`}>{product.name}</a> · {warnings.join(" · ")}
        </li>)}</ul>
      </section>}
      <h2>Produtos</h2>
      {products.data?.length ? <ul className="cards">{products.data.map((product: Product) => <li key={product.id} id={`produto-${product.id}`} className="card">
        <h3>{product.name}</h3>
        <p>{bookingCurrency.format(product.price_cents / 100)} · {product.stock} un. · {product.active ? "À venda" : "Arquivado"}</p>
        <p>Mínimo: {product.minimum_stock} un.{product.cost_cents !== null && ` · Custo unitário: ${bookingCurrency.format(product.cost_cents / 100)}`}</p>
        {product.expires_on && <p>Validade: {product.expires_on.split("-").reverse().join("/")}</p>}
        {product.sku && <p>SKU {product.sku}</p>}
        <Link className="secondary" href={`/painel/${shop}/estoque/${product.id}/midia`}>Fotos e vídeo</Link>
        <details><summary>Editar produto</summary><ProductForm shop={shop} product={product} /></details>
        <details><summary>Registrar entrada ou saída</summary>
          <form className="account-form" action={adjustStock.bind(null, shop, product.id)}>
            <label>Quantidade com sinal <input name="amount" type="number" min={-1000000} max={1000000} required placeholder="Ex.: 5 ou -2" /></label>
            <label>Motivo <input name="note" required maxLength={240} /></label>
            <SubmitButton>Registrar movimentação</SubmitButton>
          </form>
        </details>
      </li>)}</ul> : <p>Nenhum produto cadastrado.</p>}
      <h2 className="panel-form">Últimas movimentações</h2>
      {movements.data?.length ? <ul className="cards">
        {movements.data.map((movement) => <li className="card" key={movement.id}>
          <strong>{movement.delta > 0 ? "+" : ""}{movement.delta} un. · {products.data?.find(({ id }) => id === movement.product_id)?.name}</strong>
          <p>{movement.reason} · {new Date(movement.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        </li>)}
      </ul> : <p>Nenhuma movimentação registrada.</p>}
    </>}
  </section>;
}
