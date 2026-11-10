import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import QRCode from "qrcode";
import { isUuid } from "../../../../lib/establishments";
import { showcasePix } from "../../../../lib/pix";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { pageIndex } from "../../../cliente/social";
import { CopyPix } from "../assinatura/copy-pix";
import { saveCheckoutTimezone, saveSale } from "./actions";
import { SaleEditor } from "./editor";
import { itemFilters,periods,type Closing,type OpenSales,type Sale } from "./model";
import { SaleDetails, SaleList } from "./sale-list";
import { SubmitButton } from "../../../auth/submit";
import { PrintClosing } from "./print";

const status:Record<string,string> = {
  ok:"Comanda atualizada.",
  recebido:"Recebimento registrado no Financeiro.",
  pix_ready:"Conta Pix configurada. Clique em Gerar cobrança Pix para ver o QR Code e o Pix Copia e Cola.",
  timezone_saved:"Fuso horário atualizado.",
  changed:"A comanda mudou. Confira o estado atual antes de tentar de novo.",
  invalid:"Confira os itens, quantidades, telefone e dados do pagamento.",
  amount:"O valor recebido precisa ser igual ao total da comanda.",
  duplicate:"Este identificador de pagamento já foi registrado.",
  stock:"Estoque insuficiente ou produto indisponível. Ajuste os itens antes de cobrar.",

  limit:"Todos os números de comanda deste ano foram utilizados.",
  denied:"Sua conta não tem acesso à comanda.",
  falha:"Não foi possível concluir a operação. Tente novamente.",
};
const money = (cents:number)=>bookingCurrency.format(cents/100);
const timezones = { "America/Sao_Paulo":"Brasília (UTC−3)", "America/Manaus":"Manaus (UTC−4)", "America/Rio_Branco":"Rio Branco (UTC−5)", "America/Noronha":"Fernando de Noronha (UTC−2)" };
const methods = { pix:"Pix",debit:"Débito",credit:"Crédito" };

export default async function Checkout({params,searchParams}:{
  params:Promise<{establishmentId:string}>;
  searchParams:Promise<{ aba?:string; comanda?:string; modo?:string; estado?:string; periodo?:string; itens?:string; pagina?:string }>;
}) {
  const {establishmentId:shop} = await params;
  if (!isUuid(shop)) notFound();
  const args = await searchParams;
  const path = `/painel/${shop}/caixa`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({next:path}));
  const business = await supabase.from("barberflow_establishments").select("name,checkout_timezone").eq("id",shop).eq("owner_id",user.id).maybeSingle();
  if (!business.data) notFound();
  const page = pageIndex(args.pagina);
  const period = args.periodo && Object.hasOwn(periods,args.periodo) ? args.periodo as keyof typeof periods : "dia";
  const filter = args.itens && Object.hasOwn(itemFilters,args.itens) ? args.itens as keyof typeof itemFilters : "ambos";
  const id = args.comanda && isUuid(args.comanda) ? args.comanda : null;
  const closing = args.aba==="fechamento";
  const archived = args.aba==="fechadas";
  const creating = args.aba==="nova";
  const [current,openResult,reportResult,archiveResult] = await Promise.all([
    id ? supabase.rpc("barberflow_counter_sale",{shop_id:shop,sale_id:id}) : null,
    !id && !creating && !closing && !archived ? supabase.rpc("barberflow_counter_open",{shop_id:shop,page_number:page}) : null,
    closing ? supabase.rpc("barberflow_counter_report",{shop_id:shop,period,item_filter:filter,page_number:page}) : null,
    archived ? supabase.rpc("barberflow_counter_archive",{shop_id:shop,page_number:page}) : null,
  ]);
  const sale = current?.data as Sale|null;
  const opens = openResult?.data as OpenSales|null;
  const report = reportResult?.data as Closing|null;
  const closeSaved = sale?.state === "open" && (args.modo === "fechar" || args.estado === "pix_ready");
  const archive = archiveResult?.data as Sale[] | null;
  const canEdit = (sale?.state==="open" && !closeSaved) || creating || !!(id && !sale && args.estado && args.estado!=="ok" && !current?.error);
  const catalog = (table:"barberflow_services"|"barberflow_products") => {
    const query = supabase.from(table).select("id,name,price_cents")
      .eq("establishment_id",shop).eq("active",true).is("deleted_at",null).order("name").order("id");
    return table === "barberflow_products" ? query.gt("stock",0) : query;
  };
  const [services,products] = canEdit ? await Promise.all([catalog("barberflow_services"),catalog("barberflow_products")]) : [null,null];
  const chargeFeedback = args.estado === "pix_missing"
    ? "A comanda foi mantida aberta. Cadastre a chave Pix do estabelecimento para gerar a cobrança, ou escolha Débito ou Crédito."
    : args.estado === "method"
      ? "Escolha uma forma de pagamento para fechar e cobrar."
      : args.estado && Object.hasOwn(status,args.estado) ? status[args.estado] : undefined;
  const pix = sale?.state==="pending" && sale.method==="pix" && sale.pix ? showcasePix({ ...sale.pix,id:sale.id,total_cents:sale.service_cents+sale.product_cents }) : null;
  const reportUrl = (index:number)=>path+"?"+new URLSearchParams({aba:"fechamento",periodo:period,itens:filter,pagina:String(index)});
  return <section className={closing ? "container section checkout finance-report" : "container section checkout"}>
    <nav className="account-links finance-print-hide"><Link href={`/painel/${shop}/resumo`}>Visão geral</Link><Link href={path}>Comandas abertas</Link><Link href={path+"?aba=fechadas"}>Comandas fechadas</Link><Link href={path+"?aba=nova"}>Criar comanda</Link><Link href={path+"?aba=fechamento"}>Fechamento</Link></nav>
    <p className="eyebrow">{business.data.name}</p>
    <h1>{closing ? "Fechamento" : archived ? "Comandas fechadas" : closeSaved ? "Fechar comanda" : id ? "Detalhes da comanda" : creating ? "Criar comanda" : "Comandas abertas"}</h1>
    {!canEdit && chargeFeedback && <p role="status" data-feedback={["ok","recebido","pix_ready"].includes(args.estado ?? "") ? "success" : "warning"}>{chargeFeedback}</p>}
    {[current,openResult,reportResult,archiveResult,services,products].some(result=>result?.error) && <p role="alert">Não foi possível carregar todos os dados.</p>}
    {canEdit && services?.data && products?.data && <SaleEditor key={`${sale?.revision ?? id ?? "nova"}:${args.estado ?? ""}`} shop={shop} id={id ?? crypto.randomUUID()} sale={sale ?? undefined} services={services.data} products={products.data} feedback={chargeFeedback} pixMissing={args.estado === "pix_missing"} pixReady={args.estado === "pix_ready"} />}
    {closeSaved && sale && <section className="card panel-form" id="cobranca">
      <h2>{sale.number} · {sale.client_name || "Cliente não informado"}</h2>
      <SaleDetails sale={sale} />
      {args.estado === "pix_missing" && <Link className="secondary" href={`/painel/${shop}/financeiro/pagamentos?comanda=${sale.id}#conta-pix`}>Configurar Pix e voltar à comanda</Link>}
      <form className="account-form" action={saveSale.bind(null,shop,sale.id,sale.revision)}>
        <input type="hidden" name="operation" value="charge" />
        <input type="hidden" name="modo" value="fechar" />
        <label>Forma de pagamento <select name="method" defaultValue="pix">
          <option value="pix">Pix</option><option value="debit">Débito</option><option value="credit">Crédito</option>
        </select></label>
        <SubmitButton>Gerar cobrança</SubmitButton>
      </form>
      <Link className="secondary" href={path+"?comanda="+sale.id}>Editar comanda</Link>
    </section>}
    {id && !sale && !canEdit && !current?.error && <p>Comanda indisponível neste estabelecimento.</p>}
    {sale && sale.state!=="open" && <div className="card panel-form" id="cobranca">
      {args.estado === "cobranca_preparada" && sale.state === "pending" && <p role="status">Cobrança gerada. Após o pagamento, confira o recebimento antes de registrá-lo.</p>}
      <h2>{sale.number} · {{pending:"Aguardando pagamento",paid:"Recebimento registrado",cancelled:"Cancelada"}[sale.state]}</h2>
      <SaleDetails sale={sale} />
      {sale.method && <p>Pagamento por {methods[sale.method]}</p>}
      {sale.state === "pending" && sale.method === "pix" && !pix && <p role="alert">Não foi possível mostrar o Pix desta comanda. Confira os dados antes de registrar qualquer recebimento.</p>}
      {pix && <div className="panel-form">
        <img src={await QRCode.toDataURL(pix,{width:240,margin:4})} width={240} height={240} alt="QR Code Pix da comanda" />
        <label>Pix Copia e Cola <textarea value={pix} rows={4} readOnly /></label>
        <CopyPix value={pix} code />
      </div>}
      {sale.state==="pending" && <form className="account-form" action={saveSale.bind(null,shop,sale.id,sale.revision)}>
        <p>Confira o recebimento no banco ou na maquininha antes de registrar. Informe o identificador da transação.</p>
        <input type="hidden" name="operation" value="confirm" />
        <label>Valor recebido (R$) <input name="received" inputMode="decimal" required maxLength={9} defaultValue={((sale.service_cents+sale.product_cents)/100).toFixed(2).replace(".",",")} /></label>
        <label>Identificador do pagamento <input name="reference" required minLength={6} maxLength={100} /></label>
        <label><input type="checkbox" name="acknowledged" required /> Conferi o pagamento e o valor recebido.</label>
        <button className="primary">Confirmar recebimento</button>
      </form>}
      {sale.state === "paid" && <Link className="secondary" href={path+"?aba=fechadas"}>Ver comandas fechadas</Link>}
    </div>}
    {sale && ["open","pending"].includes(sale.state) && <details className="card panel-form"><summary>Cancelar comanda</summary>
      <form className="account-form" action={saveSale.bind(null,shop,sale.id,sale.revision)}>
        <input type="hidden" name="operation" value="cancel" />
        <label><input type="checkbox" name="acknowledged" required /> Confirmo o cancelamento desta comanda. Se já houve pagamento, vou conferir a transação antes de cancelar.</label>
        <button className="secondary">Confirmar cancelamento</button>
      </form>
    </details>}
    {opens && <>
      <p>{opens.count} em aberto · {money(opens.total)}</p>
      <SaleList sales={opens.rows.slice(0,15)} path={path} />
      <nav className="account-links">{page>0 && <Link href={path+"?pagina="+(page-1)}>Anterior</Link>}{opens.rows.length>15 && <Link href={path+"?pagina="+(page+1)}>Próxima</Link>}</nav>
      <Link href={`/painel/${shop}/comandas?aba=abertas`}>Consultar comandas de agendamentos</Link>
    </>}
    {archive && <>
      <SaleList sales={archive.slice(0,15)} path={path} />
      <nav className="account-links" aria-label="Paginação de comandas fechadas">
        {page>0 && <Link href={path+"?aba=fechadas&pagina="+(page-1)}>Anterior</Link>}
        {archive.length>15 && <Link href={path+"?aba=fechadas&pagina="+(page+1)}>Próxima</Link>}
      </nav>
    </>}
    {closing && <>
      <details className="card panel-form finance-print-hide"><summary>Fuso horário do fechamento</summary>
        <form className="account-form" action={saveCheckoutTimezone.bind(null,shop)}>
          <label>Fuso do estabelecimento <select name="timezone" defaultValue={business.data.checkout_timezone}>{Object.entries(timezones).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <button className="secondary">Salvar fuso</button>
        </form>
      </details>
      <form action={path} className="account-form card panel-form finance-print-hide">
        <input type="hidden" name="aba" value="fechamento" />
        <div className="form-columns"><label>Período <select name="periodo" defaultValue={period}>{Object.entries(periods).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label>Itens <select name="itens" defaultValue={filter}>{Object.entries(itemFilters).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
        <button className="primary">Aplicar filtros</button>
      </form>
      {report && <>
        <p>{periods[period]} · {itemFilters[filter]} · {report.first.split("-").reverse().join("/")} a {report.last.split("-").reverse().join("/")}</p>
        <div className="account-links"><PrintClosing /></div>
        <div className="checkout-columns">
          <Chart title="Valores recebidos" values={[["Pix",report.pix],["Débito",report.debit],["Crédito",report.credit]]} currency />
          <Chart title="Movimento no período" values={[
            ...(filter==="produtos" ? [] : [["Atendimentos concluídos",report.states.completed ?? 0],["Atendimentos cancelados",report.states.cancelled ?? 0],["Não compareceram",report.states.no_show ?? 0],["Aguardando aprovação",report.states.pending ?? 0]] as [string,number][]),
            ...(filter==="servicos" ? [] : [["Unidades de produtos vendidas",report.units]] as [string,number][]),
          ]} />
        </div>
        {report.legacy_card>0 && <p>Cartão sem modalidade no histórico · {money(report.legacy_card)}</p>}
        <h2 id="pagamentos-cartao">Comandas pagas em cartão</h2>
        <div className="checkout-columns">
          <section><h3>Débito</h3><SaleList sales={report.rows.slice(0,30).filter(s=>s.method==="debit")} path={path} /></section>
          <section><h3>Crédito</h3><SaleList sales={report.rows.slice(0,30).filter(s=>s.method==="credit")} path={path} /></section>
        </div>
        <nav className="account-links finance-print-hide">{page>0 && <Link href={reportUrl(page-1)}>Anterior</Link>}{report.rows.length>30 && <Link href={reportUrl(page+1)}>Próxima</Link>}</nav>
      </>}
    </>}
  </section>;
}

function Chart({title,values,currency=false}:{title:string;values:[string,number][];currency?:boolean}) {
  const max = Math.max(1,...values.map(([,value])=>value));
  return <section className="card panel-form"><h2>{title}</h2>{values.map(([label,value])=><div key={label}>
    <p>{label} · <strong>{currency ? money(value) : value.toLocaleString("pt-BR")}</strong></p>
    <meter min={0} max={max} value={value} aria-label={label} />
  </div>)}</section>;
}
