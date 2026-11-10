import Link from "next/link";
import { bookingCurrency } from "../../../../lib/public-booking";
import type { Sale } from "./model";
const money = (cents:number)=>bookingCurrency.format(cents/100);

export function SaleDetails({sale}:{sale:Sale}) {
  return <>
    <ul>{sale.items.map(item=><li key={item.kind+item.id}>{item.name} · {item.units} × {money(item.price)}</li>)}</ul>
    <p>Serviços {money(sale.service_cents)} · Produtos {money(sale.product_cents)}</p>
    <p><strong>Total {money(sale.service_cents+sale.product_cents)}</strong></p>
  </>;
}
export function SaleList({sales,path}:{sales:Sale[];path:string}) {
  return sales.length ? <ul className="checkout-list">{sales.map(sale=><li key={sale.id}>
    <details className="card"><summary>{sale.number} · {sale.client_name || "Cliente não informado"} · {sale.phone || "Sem telefone"} · {money(sale.amount ?? sale.service_cents+sale.product_cents)}</summary>
      <SaleDetails sale={sale} />
      <Link className="finance-print-hide" href={path+"?comanda="+sale.id}>{sale.state==="open" ? "Editar comanda" : "Abrir comanda"}</Link>
    </details></li>)}</ul> : <p>Nenhuma comanda nesta página.</p>;
}
