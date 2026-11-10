import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../../lib/establishments";
import { bookingCurrency } from "../../../../../lib/public-booking";
import { supabaseServer } from "../../../../../lib/supabase";
import { SubmitButton } from "../../../../auth/submit";
import { closeOrder, setOrderProduct } from "../../estoque/actions";
import { StockFeedback } from "../../estoque/feedback";
import { CollectPayment } from "./collect-payment";
import { closedAtLabel, orderPage, orderPeriod, orderTab } from "../../comandas/filters";

const paymentMethods: Record<string, string> = { pix: "Pix", cash: "Dinheiro", card: "Cartão", transfer: "Transferência", other: "Outro" };
type Payments = { received_cents: number; payments: {
  id: string; amount_cents: number; method: string; recorded_at: string; reversed_at: string | null; reversal_reason: string | null;
}[] };

function money(cents: number) {
  return bookingCurrency.format(cents / 100);
}

export default async function Order({ params, searchParams }: {
  params: Promise<{ establishmentId: string; appointmentId: string }>;
  searchParams: Promise<{ estado?: string; periodo?: string; pagina?: string; aba?: string; pagamento?: string }>;
}) {
  const { establishmentId: shop, appointmentId } = await params;
  if (!isUuid(shop) || !isUuid(appointmentId)) notFound();
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: `/painel/${shop}/comanda/${appointmentId}` }));
  const { data: appointment, error } = await supabase.from("barberflow_schedule")
    .select("service_name,client_name,client_phone,professional_id,starts_at,ends_at,notes,price_cents,state")
    .eq("establishment_id", shop).eq("id", appointmentId).eq("kind", "appointment").maybeSingle();
  if (error) throw new Error("Não foi possível carregar o atendimento.");
  if (!appointment) notFound();

  const [products, lines, receipt, professional] = await Promise.all([
    supabase.from("barberflow_products").select("id,name,stock,price_cents,active,sku,barcode").eq("establishment_id", shop).order("name"),
    supabase.from("barberflow_order_products").select("product_id,product_name,quantity,unit_price_cents,product_sku,product_barcode,promo_units,promo_cents,line_total_cents")
      .eq("establishment_id", shop).eq("appointment_id", appointmentId).order("product_name"),
    supabase.from("barberflow_receipts").select("service_cents,products_cents,total_cents,closed_at").eq("establishment_id", shop).eq("appointment_id", appointmentId).maybeSingle(),
    supabase.from("barberflow_professionals").select("name").eq("establishment_id", shop).eq("id", appointment.professional_id).maybeSingle(),
  ]);

  const [paymentResult, pix, cards] = receipt.data ? await Promise.all([
    supabase.rpc("barberflow_order_payments", { shop, appointment: appointmentId }),
    supabase.rpc("barberflow_business_pix", { shop }),
    supabase.rpc("barberflow_card_status", { shop, receipt: appointmentId }),
  ]) : [];
  const payments = paymentResult?.data as Payments | null | undefined;
  const { estado, periodo, pagina, aba, pagamento } = await searchParams;
  const returnQuery = new URLSearchParams({ aba: orderTab(aba ?? (receipt.data ? "fechadas" : "abertas")),
    periodo: orderPeriod(periodo), pagina: String(orderPage(pagina)) });
  const items = lines.data ?? [];
  const productDetails = new Map((products.data ?? []).map((product) => [product.id, product]));
  const productOptions = (products.data ?? []).filter((product) => product.active && product.stock > 0 && !items.some((line) => line.product_id === product.id));
  const draft = !receipt.data && ["scheduled", "completed"].includes(appointment.state);
  const activeProducts = new Set((products.data ?? []).filter(({ active, stock }) => active && stock > 0).map(({ id }) => id));
  const hasUnavailable = draft && items.some(({ product_id }) => !activeProducts.has(product_id));
  const serviceTotal = receipt.data?.service_cents ?? appointment.price_cents ?? 0;
  const productTotal = receipt.data?.products_cents ?? items.reduce((sum, item) => sum + item.line_total_cents, 0);
  const total = receipt.data?.total_cents ?? serviceTotal + productTotal;
  const discounts = items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents - item.line_total_cents, 0);

  return <section className="container section">
    <nav className="account-links" aria-label="Atendimento">
      <Link href={`/painel/${shop}/comandas?${returnQuery}`}>Voltar às comandas</Link>
      <Link href={`/painel/${shop}/agenda?dia=${appointment.starts_at.slice(0, 10)}`}>Voltar à agenda</Link>
      <Link href={`/painel/${shop}/estoque`}>Estoque</Link>
    </nav>
    <header className="operational-heading">
      <p className="eyebrow">Atendimento</p>
      <h1>Comanda</h1>
      <p>{appointment.client_name} · {appointment.service_name}</p>
    </header>
    <StockFeedback status={estado} />
    {products.error || lines.error || receipt.error || professional.error ? <p role="alert">Não foi possível carregar a comanda.</p> : <>
      <section className="card panel-form">
        <h2>Dados do atendimento</h2>
        <dl className="stock-product-facts">
          <div><dt>Cliente</dt><dd>{appointment.client_name}</dd></div>
          <div><dt>Serviço</dt><dd>{appointment.service_name}</dd></div>
          {professional.data && <div><dt>Profissional</dt><dd>{professional.data.name}</dd></div>}
          {appointment.client_phone && <div><dt>Contato</dt><dd>{appointment.client_phone}</dd></div>}
          <div><dt>Data e horário</dt><dd>{appointment.starts_at.slice(0, 10).split("-").reverse().join("/")} · {appointment.starts_at.slice(11, 16)}–{appointment.ends_at.slice(11, 16)}</dd></div>
          {receipt.data && <div><dt>Fechamento</dt><dd>{closedAtLabel(receipt.data.closed_at)}</dd></div>}
        </dl>
        {appointment.notes && <p><strong>Observações:</strong> {appointment.notes}</p>}
      </section>
      <div className="order-layout">
      <aside className="card order-summary" aria-label="Resumo da comanda">
        <h2>{receipt.data ? "Comanda fechada" : draft ? "Comanda aberta" : "Comanda indisponível"}</h2>
        <dl className="order-totals">
          <div><dt>Serviço</dt><dd>{money(serviceTotal)}</dd></div>
          <div><dt>Produtos</dt><dd>{money(productTotal)}</dd></div>
          <div><dt>Total</dt><dd>{money(total)}</dd></div>
        </dl>
        {discounts > 0 && <p>Descontos aplicados aos produtos: <strong>{money(discounts)}</strong></p>}
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
      {receipt.data && <section className="card panel-form" id="recebimento">
        <h2>Pagamentos</h2>
        {paymentResult?.error ? <p role="alert">Não foi possível consultar os pagamentos.</p>
          : !payments ? <p><Link href={`/painel/${shop}/financeiro`}>Desbloquear o Financeiro para consultar</Link></p>
          : <>
            <dl className="order-totals">
              <div><dt>Recebido</dt><dd>{money(payments.received_cents)}</dd></div>
              <div><dt>Saldo em aberto</dt><dd>{money(total - payments.received_cents)}</dd></div>
            </dl>
            {pix?.error || cards?.error ? <p role="alert">Não foi possível consultar as opções de cobrança.</p>
              : <CollectPayment shop={shop} receipt={appointmentId} balance={total - payments.received_cents}
                pix={pix?.data ?? null} cards={cards?.data ?? null} status={pagamento} />}
            {payments.payments.length ? <ul>{payments.payments.map((payment) => <li key={payment.id}>
              <strong>{money(payment.amount_cents)} · {paymentMethods[payment.method] ?? payment.method}</strong>
              <p>Registrado em {closedAtLabel(payment.recorded_at)}</p>
              {payment.reversed_at && <p>Estornado em {closedAtLabel(payment.reversed_at)} · {payment.reversal_reason}</p>}
            </li>)}</ul> : <p>Nenhum pagamento registrado.</p>}
          </>}
      </section>}
    </>}
  </section>;
}
