"use client";

import { useState } from "react";
import { bookingCurrency } from "../../../../lib/currency";
import { SubmitButton } from "../../../auth/submit";
import { saveSale } from "./actions";
import type { CatalogItem, Item, Sale } from "./model";

function options(catalog:CatalogItem[],saved:Item[]) {
  const prices = new Map(catalog.map(item=>[item.id,item]));
  for (const item of saved) prices.set(item.id,{ id:item.id,name:item.name,price_cents:item.price });
  return prices;
}

export function SaleEditor({shop,id,sale,services,products}:{shop:string;id:string;sale?:Sale;services:CatalogItem[];products:CatalogItem[]}) {
  const savedServices = sale?.items.filter(item=>item.kind==="service") ?? [];
  const savedProducts = sale?.items.filter(item=>item.kind==="product") ?? [];
  const serviceOptions = options(services,savedServices);
  const productOptions = options(products,savedProducts);
  const [serviceIds,setServiceIds] = useState(()=>Array.from({length:4},(_,i)=>savedServices[i]?.id ?? ""));
  const [productIds,setProductIds] = useState(()=>Array.from({length:4},(_,i)=>savedProducts[i]?.id ?? ""));
  const [units,setUnits] = useState(()=>Array.from({length:4},(_,i)=>savedProducts[i]?.units ?? 1));
  const serviceTotal = serviceIds.reduce((sum,id)=>sum+(serviceOptions.get(id)?.price_cents ?? 0),0);
  const productTotal = productIds.reduce((sum,id,i)=>sum+(productOptions.get(id)?.price_cents ?? 0)*units[i],0);
  const money = (cents:number)=>bookingCurrency.format(cents/100);
  const update = <T,>(values:T[],i:number,value:T)=>values.map((item,index)=>index===i ? value : item);
  return <form className="account-form card panel-form" action={saveSale.bind(null,shop,id,sale?.revision ?? 0)}>
    <h2>{sale ? "Comanda "+sale.number : "Nova comanda"}</h2>
    {!sale && <p>O número será gerado ao salvar a comanda.</p>}
    <div className="form-columns"><label>Nome do cliente <input name="customer" maxLength={120} defaultValue={sale?.client_name} /></label>
      <label>Telefone <input type="tel" name="phone" maxLength={30} defaultValue={sale?.phone} /></label></div>
    <fieldset><legend>Serviços</legend>{serviceIds.map((value,i)=><label key={i}>Serviço {i+1}
      <select name={"service"+i} value={value} onChange={event=>setServiceIds(update(serviceIds,i,event.target.value))}>
        <option value="">Nenhum</option>{[...serviceOptions.values()].map(item=><option key={item.id} value={item.id} disabled={item.id!==value && serviceIds.includes(item.id)}>{item.name} · {money(item.price_cents)}</option>)}
      </select></label>)}</fieldset>
    <fieldset><legend>Produtos</legend>{productIds.map((value,i)=><div className="form-columns" key={i}><label>Produto {i+1}
      <select name={"product"+i} value={value} onChange={event=>setProductIds(update(productIds,i,event.target.value))}>
        <option value="">Nenhum</option>{[...productOptions.values()].map(item=><option key={item.id} value={item.id} disabled={item.id!==value && productIds.includes(item.id)}>{item.name} · {money(item.price_cents)}</option>)}
      </select></label><label>Quantidade <input type="number" name={"units"+i} min={1} max={10000} required={!!value} disabled={!value} value={units[i] || ""} onChange={event=>setUnits(update(units,i,Number(event.target.value)))} /></label></div>)}</fieldset>
    <div aria-live="polite"><p>Serviços {money(serviceTotal)} · Produtos {money(productTotal)}</p><p><strong>Total {money(serviceTotal+productTotal)}</strong></p></div>
    <label>Forma de pagamento ao cobrar <select name="method"><option value="pix">Pix</option><option value="debit">Débito</option><option value="credit">Crédito</option></select></label>
    <div className="account-links">
      <SubmitButton name="operation" value="charge">Fechar e cobrar</SubmitButton>
      <SubmitButton name="operation" value="save">Manter aberta</SubmitButton>
      {!sale && <a className="secondary" href={`/painel/${shop}/resumo`}>Cancelar</a>}
    </div>
  </form>;
}
