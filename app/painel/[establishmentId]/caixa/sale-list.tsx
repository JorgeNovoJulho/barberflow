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
    <article className="card panel-form">
      <h3>{sale.number} · {sale.client_name || "Cliente não informado"}</h3>
      <p>{sale.phone || "Sem telefone"} · {money(sale.amount ?? sale.service_cents+sale.product_cents)}</p>
      <div className="account-links finance-print-hide">
        {sale.state === "open" ? <>
          <Link className="secondary" href={path+"?comanda="+sale.id}>Editar comanda</Link>
          <Link className="primary" href={path+"?comanda="+sale.id+"&modo=fechar#cobranca"}>Fechar comanda</Link>
        </> : <Link className="secondary" href={path+"?comanda="+sale.id+"#cobranca"}>
          {sale.state === "pending" ? "Ver cobrança e confirmar pagamento" : "Ver comanda fechada"}
        </Link>}
      </div>
      {sale.state === "paid" && <SaleDetails sale={sale} />}
    </article></li>)}</ul> : <p>Nenhuma comanda nesta página.</p>;
}
