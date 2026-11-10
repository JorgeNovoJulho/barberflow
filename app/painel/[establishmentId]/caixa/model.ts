export type Item = { kind:"service"|"product"; id:string; units:number; name:string; price:number };
export type Sale = {
  id:string; number:string; client_name:string; phone:string; items:Item[]; service_cents:number; product_cents:number;
  state:"open"|"pending"|"paid"|"cancelled"; revision:number; method:"pix"|"debit"|"credit"|null;
  amount?:number;
  pix:{ pix_key:string; merchant:string; city:string }|null; paid_at:string|null;
};
export type CatalogItem = { id:string; name:string; price_cents:number };
export type OpenSales = { count:number; total:number; rows:Sale[] };
export type Closing = {
  first:string; last:string; pix:number; debit:number; credit:number; legacy_card:number; units:number;
  states:Record<string,number>; rows:Sale[];
};
export const periods = { dia:"Diário", semana:"Semanal", quinzena:"Quinzenal", mes:"Mensal", trimestre:"Trimestral", semestre:"Semestral", ano:"Anual" };
export const itemFilters = { ambos:"Ambos", servicos:"Somente serviços", produtos:"Somente produtos" };
