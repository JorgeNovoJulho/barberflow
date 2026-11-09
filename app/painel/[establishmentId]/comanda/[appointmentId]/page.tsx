import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../../lib/establishments";
import { bookingCurrency } from "../../../../../lib/public-booking";
import { supabaseServer } from "../../../../../lib/supabase";
import { SubmitButton } from "../../../../auth/submit";
import { closeOrder, setOrderProduct } from "../../estoque/actions";
import { StockFeedback } from "../../estoque/feedback";

function money(cents: number) {
  return bookingCurrency.format(cents / 100);
}

export default async function Order({ params, searchParams }: {
  params: Promise<{ establishmentId: string; appointmentId: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { establishmentId: shop, appointmentId } = await params;
  if (!isUuid(shop) || !isUuid(appointmentId)) notFound();
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: `/painel/${shop}/comanda/${appointmentId}` }));
  const { data: appointment, error } = await supabase.from("barberflow_schedule")
    .select("service_name,client_name,starts_at,price_cents,state").eq("establishment_id", shop).eq("id", appointmentId).eq("kind", "appointment").maybeSingle();
  if (error) throw new Error("Não foi possível carregar o atendimento.");
  if (!appointment) notFound();

  const [products, lines, receipt] = await Promise.all([
    supabase.from("barberflow_products").select("id,name,stock,price_cents,active,sku,barcode").eq("establishment_id", shop).order("name"),
    supabase.from("barberflow_order_products").select("product_id,product_name,quantity,unit_price_cents,product_sku,product_barcode,promo_units,promo_cents,line_total_cents")
      .eq("establishment_id", shop).eq("appointment_id", appointmentId).order("product_name"),
    supabase.from("barberflow_receipts").select("service_cents,products_cents,total_cents").eq("establishment_id", shop).eq("appointment_id", appointmentId).maybeSingle(),
  ]);
  const { estado } = await searchParams;
  const items = lines.data ?? [];
  const productDetails = new Map((products.data ?? []).map((product) => [product.id, product]));
  const productOptions = (products.data ?? []).filter((product) => product.active && !items.some((line) => line.product_id === product.id));
  const draft = !receipt.data && ["scheduled", "completed"].includes(appointment.state);
  const activeProducts = new Set((products.data ?? []).filter(({ active }) => active).map(({ id }) => id));
  const hasUnavailable = draft && items.some(({ product_id }) => !activeProducts.has(product_id));
  const serviceTotal = receipt.data?.service_cents ?? appointment.price_cents ?? 0;
  const productTotal = receipt.data?.products_cents ?? items.reduce((sum, item) => sum + item.line_total_cents, 0);
  const total = receipt.data?.total_cents ?? serviceTotal + productTotal;

  return <section className="container section">
    <nav className="account-links" aria-label="Atendimento">
      <Link href={`/painel/${shop}/agenda?dia=${appointment.starts_at.slice(0, 10)}`}>Voltar à agenda</Link>
      <Link href={`/painel/${shop}/estoque`}>Estoque</Link>
    </nav>
    <header className="operational-heading">
      <p className="eyebrow">Atendimento</p>
      <h1>Comanda</h1>
      <p>{appointment.client_name} · {appointment.service_name}</p>
    </header>
    <StockFeedback status={estado} />
    {products.error || lines.error || receipt.error ? <p role="alert">Não foi possível carregar a comanda.</p> : <>
      <div className="order-layout">
      <aside className="card order-summary" aria-label="Resumo da comanda">
        <h2>{receipt.data ? "Comanda fechada" : draft ? "Comanda aberta" : "Comanda indisponível"}</h2>
        <dl className="order-totals">
          <div><dt>Serviço</dt><dd>{money(serviceTotal)}</dd></div>
          <div><dt>Produtos</dt><dd>{money(productTotal)}</dd></div>
          <div><dt>Total</dt><dd>{money(total)}</dd></div>
        </dl>
        {draft && (appointment.state === "completed"
          ? <form className="account-links" action={closeOrder.bind(null, shop, appointmentId)}><SubmitButton disabled={hasUnavailable}>Fechar comanda e baixar estoque</SubmitButton></form>
          : <p>Conclua o atendimento na agenda para fechar a comanda.</p>)}
        {hasUnavailable && <p role="status">Retire os produtos congelados ou excluídos antes de fechar a comanda.</p>}
      </aside>
      <div className="order-items">
      {draft && productOptions.length > 0 && <details className="card panel-form">
        <summary>Adicionar produto</summary>
        <form className="account-form" action={setOrderProduct.bind(null, shop, appointmentId, null)}>
          <label>Produto <select name="product" defaultValue="" required>
            <option value="" disabled>Selecione</option>
            {productOptions.map(({ id, name, stock, price_cents, sku, barcode }) => <option key={id} value={id}>
              {[name, sku && `SKU ${sku}`, barcode && `Barras ${barcode}`, money(price_cents), `${stock} un. em estoque`].filter(Boolean).join(" · ")}
            </option>)}
          </select></label>
          <label>Quantidade <input type="number" name="units" min={1} max={10000} defaultValue={1} required /></label>
          <SubmitButton>Adicionar à comanda</SubmitButton>
        </form>
      </details>}
      <h2>Produtos da comanda</h2>
      {items.length ? <ul className="cards">{items.map((item) => {
        const original = productDetails.get(item.product_id);
        const sku = item.product_sku ?? original?.sku;
        const barcode = item.product_barcode ?? original?.barcode;
        const bundles = item.promo_units ? Math.floor(item.quantity / item.promo_units) : 0;
        const remainder = item.promo_units ? item.quantity % item.promo_units : item.quantity;
        return <li className="card order-product" key={item.product_id}>
        <div className="order-product-line"><h3>{item.product_name}</h3><strong>{money(item.line_total_cents)}</strong></div>
        <p>{item.quantity} un. · Preço normal {money(item.unit_price_cents)}/un.</p>
        {(sku || barcode) && <p>{[sku && `Código interno: ${sku}`, barcode && `Código de barras: ${barcode}`].filter(Boolean).join(" · ")}</p>}
        {bundles > 0 && item.promo_cents != null && <p>
          Promoção: {bundles} × ({item.promo_units} un. por {money(item.promo_cents)})
          {remainder > 0 && ` + ${remainder} un. ao preço normal`}
        </p>}
        {draft && !activeProducts.has(item.product_id) && <form className="account-links" action={setOrderProduct.bind(null, shop, appointmentId, item.product_id)}>
          <input type="hidden" name="units" value={0} />
          <SubmitButton>Remover produto indisponível</SubmitButton>
        </form>}
        {draft && activeProducts.has(item.product_id) && <details><summary>Alterar quantidade ou remover</summary>
          <form className="account-form" action={setOrderProduct.bind(null, shop, appointmentId, item.product_id)}>
            <label>Quantidade <input type="number" name="units" min={0} max={10000} defaultValue={item.quantity} required /></label>
            <p>Use zero para remover o produto da comanda.</p>
            <SubmitButton>Atualizar item</SubmitButton>
          </form>
        </details>}
      </li>;
      })}</ul> : <p className="card">Nenhum produto adicionado.</p>}
      </div>
      </div>
    </>}
  </section>;
}
