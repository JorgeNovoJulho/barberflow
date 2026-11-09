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
    supabase.from("barberflow_products").select("id,name,stock,price_cents,active").eq("establishment_id", shop).order("name"),
    supabase.from("barberflow_order_products").select("product_id,product_name,quantity,unit_price_cents").eq("establishment_id", shop).eq("appointment_id", appointmentId).order("product_name"),
    supabase.from("barberflow_receipts").select("service_cents,products_cents,total_cents").eq("establishment_id", shop).eq("appointment_id", appointmentId).maybeSingle(),
  ]);
  const { estado } = await searchParams;
  const items = lines.data ?? [];
  const productOptions = (products.data ?? []).filter((product) => product.active && !items.some((line) => line.product_id === product.id));
  const draft = !receipt.data && ["scheduled", "completed"].includes(appointment.state);
  const serviceTotal = receipt.data?.service_cents ?? appointment.price_cents ?? 0;
  const productTotal = receipt.data?.products_cents ?? items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);
  const total = receipt.data?.total_cents ?? serviceTotal + productTotal;

  return <section className="container section">
    <nav className="account-links" aria-label="Atendimento">
      <Link href={`/painel/${shop}/agenda?dia=${appointment.starts_at.slice(0, 10)}`}>Voltar à agenda</Link>
      <Link href={`/painel/${shop}/estoque`}>Estoque</Link>
    </nav>
    <h1>Comanda</h1>
    <p>{appointment.client_name} · {appointment.service_name}</p>
    <StockFeedback status={estado} />
    {products.error || lines.error || receipt.error ? <p role="alert">Não foi possível carregar a comanda.</p> : <>
      <div className="card panel-form">
        <h2>{receipt.data ? "Comanda fechada" : draft ? "Comanda aberta" : "Comanda indisponível"}</h2>
        <dl className="order-totals">
          <div><dt>Serviço</dt><dd>{money(serviceTotal)}</dd></div>
          <div><dt>Produtos</dt><dd>{money(productTotal)}</dd></div>
          <div><dt>Total</dt><dd>{money(total)}</dd></div>
        </dl>
        {draft && (appointment.state === "completed"
          ? <form className="account-links" action={closeOrder.bind(null, shop, appointmentId)}><SubmitButton>Fechar comanda e baixar estoque</SubmitButton></form>
          : <p>Conclua o atendimento na agenda para fechar a comanda.</p>)}
      </div>
      {draft && productOptions.length > 0 && <details className="card panel-form">
        <summary>Adicionar produto</summary>
        <form className="account-form" action={setOrderProduct.bind(null, shop, appointmentId, null)}>
          <label>Produto <select name="product" defaultValue="" required>
            <option value="" disabled>Selecione</option>
            {productOptions.map(({ id, name, stock, price_cents }) => <option key={id} value={id}>{name} · {money(price_cents)} · {stock} un. em estoque</option>)}
          </select></label>
          <label>Quantidade <input type="number" name="units" min={1} max={10000} defaultValue={1} required /></label>
          <SubmitButton>Adicionar à comanda</SubmitButton>
        </form>
      </details>}
      <h2>Produtos da comanda</h2>
      {items.length ? <ul className="cards">{items.map((item) => <li className="card" key={item.product_id}>
        <h3>{item.product_name}</h3><p>{item.quantity} × {money(item.unit_price_cents)} · {money(item.quantity * item.unit_price_cents)}</p>
        {draft && <details><summary>Alterar quantidade ou remover</summary>
          <form className="account-form" action={setOrderProduct.bind(null, shop, appointmentId, item.product_id)}>
            <label>Quantidade <input type="number" name="units" min={0} max={10000} defaultValue={item.quantity} required /></label>
            <p>Use zero para remover o produto da comanda.</p>
            <SubmitButton>Atualizar item</SubmitButton>
          </form>
        </details>}
      </li>)}</ul> : <p>Nenhum produto adicionado.</p>}
    </>}
  </section>;
}
