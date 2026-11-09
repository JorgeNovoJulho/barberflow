import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { adjustStock, saveProduct } from "./actions";
import { StockFeedback } from "./feedback";
import { offsetDay, saoPauloToday } from "../../../../lib/agenda";
import { productMediaSlots, productPhotoBucket, productVideoBucket } from "../../../../lib/product-media";
import { ProductGallery, type ProductMedia } from "./product-gallery";

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
  const catalog = (products.data ?? []) as Product[];
  const signed = new Map<string, string>();
  let mediaUnavailable = false;
  for (let index = 0; index < catalog.length; index += 100) {
    const batch = catalog.slice(index, index + 100);
    const paths = (slots: readonly string[]) => batch.flatMap(({ id }) => slots.map((slot) => `${shop}/${id}/${slot}`));
    const files = await Promise.all([
      supabase.storage.from(productPhotoBucket).createSignedUrls(paths(productMediaSlots.slice(0, -1)), 3600),
      supabase.storage.from(productVideoBucket).createSignedUrls(paths(["video"]), 3600),
    ]);
    for (const result of files) {
      if (result.error) mediaUnavailable = true;
      for (const file of result.data ?? []) {
        if (!file.error && file.path && file.signedUrl) signed.set(file.path, file.signedUrl);
      }
    }
  }
  const activeProducts = catalog.filter(({ active }) => active);
  const productNames = new Map(catalog.map(({ id, name }) => [id, name]));
  const warningsByProduct = new Map(flagged.map(({ product, warnings }) => [product.id, warnings]));
  return <section className="container section stock-workspace">
    <nav className="account-links" aria-label="Estabelecimento">
      <Link href="/painel">Meus estabelecimentos</Link><Link href={`/painel/${shop}/agenda`}>Agenda</Link>
    </nav>
    <header className="operational-heading">
      <p className="eyebrow">{business.name}</p><h1>Estoque</h1>
      <p>Produtos, quantidades, validade e movimentações do estabelecimento.</p>
    </header>
    <StockFeedback status={estado} />
    {products.error || movements.error ? <p role="alert">Não foi possível carregar o estoque.</p> : <>
      <dl className="cards stock-metrics">
        <div className="card dashboard-metric"><dt>Produtos à venda</dt><dd>{activeProducts.length}</dd></div>
        <div className="card dashboard-metric"><dt>Unidades em produtos à venda</dt><dd>{activeProducts.reduce((total, item) => total + item.stock, 0).toLocaleString("pt-BR")}</dd></div>
        <div className="card dashboard-metric"><dt>Produtos com alerta</dt><dd>{flagged.length}</dd></div>
      </dl>
      <details className="card panel-form"><summary>Novo produto</summary><ProductForm shop={shop} /></details>
      {flagged.length > 0 && <section className="card panel-form stock-alerts" aria-labelledby="stock-alerts-title">
        <h2 id="stock-alerts-title">Alertas de estoque e validade</h2>
        <ul>{flagged.map(({ product, warnings }) => <li key={product.id}>
          <a href={`#produto-${product.id}`}>{product.name}</a> · {warnings.join(" · ")}
        </li>)}</ul>
      </section>}
      <h2>Produtos</h2>
      {mediaUnavailable && <p role="status">Algumas mídias não puderam ser carregadas no catálogo.</p>}
      {catalog.length ? <ul className="cards">{catalog.map((product) => <li key={product.id} id={`produto-${product.id}`} className="card stock-product">
        <div className="stock-product-top">
          <span className={`stock-label${product.active ? " stock-label-active" : ""}`}>{product.active ? "À venda" : "Arquivado"}</span>
          {product.sku && <span className="stock-sku">SKU {product.sku}</span>}
        </div>
        <h3>{product.name}</h3>
        <ProductGallery name={product.name} items={productMediaSlots.flatMap((slot): ProductMedia[] => {
          const url = signed.get(`${shop}/${product.id}/${slot}`);
          return url ? [{ slot, kind: slot === "video" ? "video" : "photo", url }] : [];
        })} />
        <dl className="stock-product-facts">
          <div><dt>Preço de venda</dt><dd>{bookingCurrency.format(product.price_cents / 100)}</dd></div>
          <div><dt>Estoque</dt><dd>{product.stock.toLocaleString("pt-BR")} un.</dd></div>
          <div><dt>Estoque mínimo</dt><dd>{product.minimum_stock} un.</dd></div>
          {product.cost_cents !== null && <div><dt>Custo unitário</dt><dd>{bookingCurrency.format(product.cost_cents / 100)}</dd></div>}
          {product.expires_on && <div><dt>Validade</dt><dd>{product.expires_on.split("-").reverse().join("/")}</dd></div>}
        </dl>
        {warningsByProduct.has(product.id) && <ul className="stock-warnings">
          {warningsByProduct.get(product.id)?.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>}
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
      {movements.data?.length ? <ul className="card stock-movements">
        {movements.data.map((movement) => <li key={movement.id}>
          <span className={`stock-label${movement.delta > 0 ? " stock-label-active" : " stock-label-out"}`}>{movement.delta > 0 ? "+" : ""}{movement.delta} un.</span>
          <div><strong>{productNames.get(movement.product_id) ?? "Produto"}</strong>
          <p>{movement.reason} · {new Date(movement.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p></div>
        </li>)}
      </ul> : <p>Nenhuma movimentação registrada.</p>}
    </>}
  </section>;
}
