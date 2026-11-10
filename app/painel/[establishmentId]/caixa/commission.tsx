import Link from "next/link";
import { bookingCurrency } from "../../../../lib/public-booking";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { saveCommission } from "./actions";
import { PrintClosing } from "./print";

const periods = { dia: "Diário", semana: "Semanal", quinzena: "Quinzenal", mes: "Mensal" };
const origins = { online: "Agendamento online", porta: "Atendimento registrado pela loja", balcao: "Atendimento de porta · Criar comanda" };
const money = (cents: number) => bookingCurrency.format(cents / 100);
const dayLabel = (day: string) => day.split("-").reverse().join("/");
const dateTime = (value: string, timeZone: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(value));

type Order = {
  id: string; professional_id: string | null; number: string; closed: string; origin: keyof typeof origins;
  items: { name: string; kind: "service" | "product"; units: number; price: number }[];
  service_commission: number | null; product_commission: number | null; receipt_id?: string;
};
type Report = { shop: string; timezone: string; first: string; last: string; orders: Order[]; professionals: { id: string; name: string }[] };
type Receipt = Omit<Report, "professionals"> & { issued_at: string; amount: number; professional: string };
type History = Pick<Receipt, "issued_at" | "first" | "last" | "professional"> & { id: string };

function Orders({ orders, timezone }: { orders: Order[]; timezone: string }) {
  return <ul className="commission-orders">{orders.map((order) => <li key={order.origin + order.id}>
    <strong>Comanda {order.number}</strong> · {dateTime(order.closed, timezone)} · {origins[order.origin]}
    <ul>{order.items.map((item, index) => <li key={index}>{item.kind === "service" ? "Serviço" : "Produto"} · {item.name} · {item.units} × {money(item.price)}</li>)}</ul>
    <p>Serviços {order.service_commission === null ? "sem percentual registrado" : money(order.service_commission)} · Produtos {order.product_commission === null ? "sem percentual registrado" : money(order.product_commission)}
      {order.receipt_id && " · Já incluída em recibo"}</p>
  </li>)}</ul>;
}

export async function CommissionClosing({ shop, args }: { shop: string; args: { periodo?: string; data?: string; recibo?: string; estado?: string } }) {
  const path = `/painel/${shop}/caixa`;
  const base = path + "?aba=comissoes";
  const period = args.periodo && Object.hasOwn(periods, args.periodo) ? args.periodo : "dia";
  const parsed = args.data && /^\d{4}-\d{2}-\d{2}$/.test(args.data) ? new Date(args.data + "T00:00:00Z") : null;
  const day = parsed && Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === args.data ? args.data : "";
  const supabase = await supabaseServer();
  const receiptId = args.recibo && isUuid(args.recibo) ? args.recibo : null;
  if (receiptId) {
    const result = await supabase?.rpc("barberflow_commission_receipts", { shop_id: shop, receipt: receiptId });
    const receipt = result?.data as Receipt | null;
    return <section className="section commission-receipt">
      <div className="account-links finance-print-hide"><Link href={base}>Voltar às comissões</Link>{receipt && <PrintClosing label="Imprimir termo" />}</div>
      {receipt ? <>
        <h1>Termo de quitação de comissão</h1>
        <p>{receipt.shop} · Recibo {receiptId.slice(0,8).toUpperCase()}</p>
        <p>Emitido em {dateTime(receipt.issued_at, receipt.timezone)}</p>
        <p>Eu, <strong>{receipt.professional}</strong>, declaro que recebi de <strong>{receipt.shop}</strong> o valor de <strong>{money(receipt.amount)}</strong> pelas comissões discriminadas abaixo, referentes ao período de {dayLabel(receipt.first)} a {dayLabel(receipt.last)}.</p>
        <Orders orders={receipt.orders} timezone={receipt.timezone} />
        <p className="commission-signature">Data do recebimento ____ / ____ / ________</p>
        <p className="commission-signature">Assinatura do profissional __________________________________</p>
      </> : <p role="alert">Recibo indisponível para este estabelecimento.</p>}
    </section>;
  }
  const [result, history] = await Promise.all([
    supabase?.rpc("barberflow_commission_report", { shop_id: shop, period, reference_day: day || null }),
    supabase?.rpc("barberflow_commission_receipts", { shop_id: shop }),
  ]);
  const report = result?.data as Report | null;
  return <section className="section">
    <nav className="account-links"><Link href={path + "?aba=fechamento"}>Fechamento geral</Link><Link href={base} aria-current="page">Comissões</Link></nav>
    <h1>Fechamento de comissões</h1>
    <form className="card account-form panel-form" action={path}>
      <input type="hidden" name="aba" value="comissoes" />
      <label>Período <select name="periodo" defaultValue={period}>{Object.entries(periods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Data de referência <input type="date" name="data" defaultValue={day} /></label>
      <button className="primary">Aplicar filtros</button>
    </form>
    {args.estado === "comissao_vinculada" && <p role="status">Profissional vinculado à comanda.</p>}
    {args.estado === "comissao_falha" && <p role="alert">Não foi possível concluir. Confira o vínculo ou se há comissões elegíveis ainda sem recibo.</p>}
    {report ? <>
      <p>{dayLabel(report.first)} a {dayLabel(report.last)}</p>
      {report.orders.length === 0 && <p>Nenhuma comanda fechada no período.</p>}
      {report.professionals.map((person) => {
        const orders = report.orders.filter((order) => order.professional_id === person.id);
        if (!orders.length) return null;
        const pending = orders.reduce((sum, order) => sum + (!order.receipt_id && order.service_commission !== null && order.product_commission !== null
          ? order.service_commission + order.product_commission : 0), 0);
        return <section className="card panel-form" key={person.id}>
          <h2>{person.name}</h2>
          <p><strong>Comissão elegível sem recibo {money(pending)}</strong></p>
          <Orders orders={orders} timezone={report.timezone} />
          {pending > 0 && <form className="account-form" action={saveCommission.bind(null, shop, period, day, null, pending)}>
            <input type="hidden" name="professional" value={person.id} />
            <label><input name="paid" type="checkbox" required /> Confirmo que paguei o valor ao profissional.</label>
            <SubmitButton>Emitir termo de quitação</SubmitButton>
          </form>}
        </section>;
      })}
      {report.orders.filter((order) => !order.professional_id).map((order) => <section className="card panel-form" key={order.id}>
        <h2>Comanda sem profissional</h2>
        <Orders orders={[order]} timezone={report.timezone} />
        <form className="account-form" action={saveCommission.bind(null, shop, period, day, order.id, 0)}>
          <label>Profissional <select name="professional" required defaultValue=""><option value="" disabled>Selecione</option>{report.professionals.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <p>O vínculo registra os percentuais atuais do profissional para esta comanda.</p>
          <SubmitButton>Vincular profissional</SubmitButton>
        </form>
      </section>)}
    </> : <p role="alert">Não foi possível carregar as comissões.</p>}
    <h2>Termos emitidos</h2>
    {history?.error ? <p role="alert">Não foi possível carregar o histórico.</p> : (history?.data as History[] | null)?.length ?
      <ul>{(history?.data as History[]).map((receipt) => <li key={receipt.id}><Link href={base + "&recibo=" + receipt.id}>{receipt.professional} · {dayLabel(receipt.first)} a {dayLabel(receipt.last)}</Link></li>)}</ul> : <p>Nenhum termo emitido.</p>}
  </section>;
}
