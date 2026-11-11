import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../../lib/establishments";
import { defaultMargins } from "../../../../../lib/stock-pricing";
import { supabaseServer } from "../../../../../lib/supabase";
import { MarginForm } from "./margin-form";

export default async function StockMargins({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>; searchParams: Promise<{ estado?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const finance = `/painel/${shop}/financeiro`;
  const supabase = await supabaseServer();
  if (!supabase) redirect(finance);
  const status = await supabase.rpc("barberflow_finance_status", { shop });
  if (status.data !== "unlocked") redirect(finance);
  const { data, error } = await supabase.from("barberflow_stock_margins").select("alta,media,baixa").eq("shop", shop).maybeSingle();
  const { estado } = await searchParams;
  return <section className="container section">
    <nav className="account-links"><Link href={finance}>Voltar ao Financeiro</Link><Link href={`/painel/${shop}/estoque`}>Estoque</Link></nav>
    <h1>Margens de produtos</h1>
    <p>Os percentuais são acrescentados ao custo unitário quando você salva um produto com uma margem selecionada.</p>
    <p>Para produtos próximos da validade, monte no Estoque ofertas de 3, 5 ou 10 unidades com acréscimo de até 20% sobre o custo do grupo.</p>
    {estado && <p role="status">{estado === "salvo" ? "Margens salvas." : "Não foi possível salvar as margens. Confira os limites e o acesso ao Financeiro."}</p>}
    {error ? <p role="alert">Não foi possível carregar as margens.</p> : <MarginForm shop={shop} margins={data ?? defaultMargins} />}
  </section>;
}
