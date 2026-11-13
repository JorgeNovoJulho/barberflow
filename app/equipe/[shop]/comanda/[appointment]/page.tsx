import { CashReceived } from "./cash-received";
import QRCode from "qrcode";
import { showcasePix } from "../../../../../lib/pix";
import { CopyPix } from "../../../../painel/[establishmentId]/assinatura/copy-pix";
import { appointmentAvatars, ClientAvatar } from "../../../../painel/[establishmentId]/appointment-card";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../../lib/establishments";
import { bookingCurrency } from "../../../../../lib/public-booking";
import { supabaseServer } from "../../../../../lib/supabase";
import { SubmitButton } from "../../../../auth/submit";

type Item = { id: string; name: string };
type Order = {
  starts?: string; booked_by?: string | null; professional?: string; professional_photo?: string; client: string; phone: string | null; service: string; base: number; state: string; closed: string | null;
  products: (Item & { units: number; cents: number })[]; services: (Item & { cents: number })[];
  product_options: Item[]; service_options: Item[];
};

const money = (cents: number) => bookingCurrency.format(cents / 100);
const path = (shop: string, appointment: string) => `/equipe/${shop}/comanda/${appointment}`;

async function session(shop: string, appointment: string) {
  if (!isUuid(shop) || !isUuid(appointment)) notFound();
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) {
    redirect("/login?" + new URLSearchParams({ next: path(shop, appointment) }));
  }
  return supabase;
}

async function update(shop: string, appointment: string, operation: "product" | "service" | "remove-service" | "close", item: string | null, form: FormData) {
  "use server";
  const supabase = await session(shop, appointment);
  const id = item ?? String(form.get("item") ?? "");
  const units = form.get("remove") === "1" ? "0" : String(form.get("units") ?? "");
  const back = path(shop, appointment);
  if (operation !== "close" && !isUuid(id)) redirect(back + "?estado=invalido");
  if (operation === "product" && (!/^\d{1,5}$/.test(units) || Number(units) > 10000)) redirect(back + "?estado=invalido");
  const result = operation === "close"
    ? await supabase.rpc("barberflow_close_order", { shop, appointment })
    : operation === "product"
      ? await supabase.rpc("barberflow_set_order_product", { shop, appointment, product: id, units: Number(units) })
      : await supabase.rpc("barberflow_set_order_service", { shop, appointment, service: id, remove_item: operation === "remove-service" });
  redirect(back + "?estado=" + (result.error || result.data === false ? "falha" : "salvo"));
}

async function settle(shop: string, appointment: string, expected: number, form: FormData) {
  "use server";
  const supabase = await session(shop, appointment);
  const amount = String(form.get("cash") ?? "").replace(",", ".");
  const tendered = /^\d{1,8}(\.\d{1,2})?$/.test(amount) ? Math.round(Number(amount) * 100) : null;
  const { data } = await supabase.rpc("barberflow_professional_settle_order", { shop, appointment, method: form.get("method"), expected, tendered });
  redirect(path(shop, appointment) + (data ? "?estado=salvo" : "?estado=falha"));
}

export default async function ProfessionalOrder({ params, searchParams }: {
  params: Promise<{ shop: string; appointment: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { shop, appointment } = await params;
  const supabase = await session(shop, appointment);
  const { data, error } = await supabase.rpc("barberflow_professional_order", { shop, appointment });
  if (error) throw new Error("Não foi possível carregar a comanda.");
  if (!data) notFound();
  const order = data as Order;
  const avatars = await appointmentAvatars(supabase, [{ id: appointment, booked_by: order.booked_by ?? null }]);
  const { estado } = await searchParams;
  const editable = !order.closed && order.state === "scheduled";
  const { data: number } = editable || order.closed ? await supabase.rpc("barberflow_appointment_order_number", { shop, appointment }) : { data: null };
  const total = order.base + [...order.services, ...order.products].reduce((sum, item) => sum + item.cents, 0);
  const pix = editable ? (await supabase.rpc("barberflow_professional_order_pix", { shop, appointment })).data : null;
  const code = pix ? showcasePix({ ...pix, id: appointment, total_cents: total }) : null;
  const qr = code ? await QRCode.toDataURL(code, { margin: 4 }) : null;
  const products = order.product_options.filter(({ id }) => !order.products.some((item) => item.id === id));
  const services = order.service_options.filter(({ id }) => !order.services.some((item) => item.id === id));
  return <section className="container section professional-workspace">
    <Link href={`/equipe/${shop}/meu-painel#agenda-dia`}>Voltar ao painel profissional</Link>
    <h1>Comanda{number ? " " + number : ""}</h1>
    {estado && <p role={estado === "salvo" ? "status" : "alert"}>{estado === "salvo" ? "Comanda atualizada." : "Confira os itens e o estoque antes de tentar novamente."}</p>}
    <section className="card">
      <h2 className="subscription-business"><ClientAvatar photo={avatars.get(appointment)} />{order.client}</h2>
      {order.starts && <time className="professional-appointment-time" dateTime={order.starts}>{order.starts.slice(0, 10).split("-").reverse().join("/")} às {order.starts.slice(11, 16)}</time>}
      {order.professional && <p className="subscription-business"><ClientAvatar photo={order.professional_photo} />{order.professional}</p>}
      {order.phone && <p>{order.phone}</p>}
      <p>{order.service} · {money(order.base)}</p>
      {order.services.length > 0 && <ul className="finance-entry-list">{order.services.map((item) => <li key={item.id}>
        {item.name} · {money(item.cents)}
        {editable && <form action={update.bind(null, shop, appointment, "remove-service", item.id)}><SubmitButton>Remover serviço</SubmitButton></form>}
      </li>)}</ul>}
      {order.products.length > 0 && <ul className="finance-entry-list">{order.products.map((item) => <li key={item.id}>
        {item.name} · {item.units} un. · {money(item.cents)}
        {editable && <form className="account-form" action={update.bind(null, shop, appointment, "product", item.id)}>
          <label>Quantidade de {item.name} <input name="units" type="number" min={0} max={10000} defaultValue={item.units} required /></label>
          <SubmitButton>Atualizar quantidade</SubmitButton>
          <SubmitButton name="remove" value="1">Remover produto</SubmitButton>
        </form>}
      </li>)}</ul>}
      <p><strong>Total {money(total)}</strong></p>
      {order.closed && <p>Comanda fechada. A cobrança fica disponível para o caixa.</p>}
    </section>
    {editable && <>
      {services.length > 0 && <details className="card"><summary>Adicionar serviço</summary>
        <form className="account-form" action={update.bind(null, shop, appointment, "service", null)}>
          <label>Serviço <select name="item" required>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <SubmitButton>Adicionar serviço</SubmitButton>
        </form>
      </details>}
      {products.length > 0 && <details className="card"><summary>Adicionar produto</summary>
        <form className="account-form" action={update.bind(null, shop, appointment, "product", null)}>
          <label>Produto <select name="item" required>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Quantidade <input name="units" type="number" min={1} max={10000} defaultValue={1} required /></label>
          <SubmitButton>Adicionar produto</SubmitButton>
        </form>
      </details>}
      <details className="card"><summary>Fechar comanda</summary>
        {qr && code && <details><summary>Pagar com Pix</summary>
          <img src={qr} alt="QR Code Pix da comanda" width={220} height={220} />
          <CopyPix value={code} code />
          <form action={settle.bind(null, shop, appointment, total)}><SubmitButton name="method" value="pix">Confirmar recebimento Pix</SubmitButton></form>
        </details>}
        {!code && <p>Pix indisponível. Confira a configuração do estabelecimento.</p>}
        <form className="account-form" action={settle.bind(null, shop, appointment, total)}>
          <SubmitButton name="method" value="debit">Confirmar recebimento no débito</SubmitButton>
          <SubmitButton name="method" value="credit">Confirmar recebimento no crédito</SubmitButton>
        </form>
        <form className="account-form" action={settle.bind(null, shop, appointment, total)}>
          <CashReceived total={total} />
        </form>
      </details>
    </>}
  </section>;
}
