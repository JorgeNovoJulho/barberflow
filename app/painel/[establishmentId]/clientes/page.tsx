import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { bookingCurrency } from "../../../../lib/public-booking";
import { SubmitButton } from "../../../auth/submit";
import { PanelStatus } from "../../status";
import { saveClient } from "./actions";

type Client = { id: string; name: string; phone: string; preferences: string; notes: string; active: boolean };
type DirectoryClient = Client & { last_visit: string | null; visits: number; billed_cents: number };
const returnOptions = [15, 20, 30, 45, 60, 90];
const sorting = { visit: "Última visita", spend: "Maior faturamento", recent: "Cadastro recente", name: "Nome" };

function ClientForm({ shop, client }: { shop: string; client?: Client }) {
  return <form className="account-form" action={saveClient.bind(null, shop, client?.id ?? null)}>
    <label>Nome <input name="name" maxLength={120} required defaultValue={client?.name} /></label>
    <label>WhatsApp <input name="phone" type="tel" maxLength={30} defaultValue={client?.phone} /></label>
    <label>Preferências <textarea name="preferences" rows={2} maxLength={1000} defaultValue={client?.preferences} /></label>
    <label>Observações internas <textarea name="notes" rows={2} maxLength={1000} defaultValue={client?.notes} /></label>
    {client && <label><input name="active" type="checkbox" defaultChecked={client.active} /> Cliente ativo</label>}
    <SubmitButton>Salvar cliente</SubmitButton>
  </form>;
}

const states: Record<string, string> = {
  pending: "Aguardando confirmação", scheduled: "Agendado", completed: "Concluído", cancelled: "Cancelado", no_show: "Não compareceu",
};

export default async function Clients({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ estado?: string; busca?: string; cliente?: string; retorno?: string; ordem?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const path = `/painel/${shop}/clientes`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path }));
  const { data: establishment, error: shopError } = await supabase.from("barberflow_establishments").select("name").eq("id", shop).maybeSingle();
  if (shopError) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!establishment) notFound();

  const { estado, busca, cliente, retorno, ordem } = await searchParams;
  const search = typeof busca === "string" ? busca.trim().slice(0, 120) : "";
  const returnDays = returnOptions.find((days) => String(days) === retorno) ?? 0;
  const sort = typeof ordem === "string" && Object.hasOwn(sorting, ordem) ? ordem : "visit";
  const { data, error } = await supabase.rpc("barberflow_client_directory", {
    shop, search_text: search, return_days: returnDays, sort_by: sort,
  });
  const clients = (data ?? []) as DirectoryClient[];
  const chosen = cliente && isUuid(cliente) ? clients.find((item) => item.id === cliente) : undefined;
  const history = chosen ? await supabase.from("barberflow_schedule").select("id,service_name,state,starts_at")
    .eq("establishment_id", shop).eq("client_id", chosen.id).order("starts_at", { ascending: false }).limit(25) : null;

  return <section className="container section">
    <nav className="account-links" aria-label="Estabelecimento">
      <Link href="/painel">Meus estabelecimentos</Link>
      <Link href={`/painel/${shop}/agenda`}>Agenda</Link>
    </nav>
    <p className="eyebrow">{establishment.name}</p>
    <h1>Clientes</h1>
    <PanelStatus status={estado} />
    {error ? <p role="alert">Não foi possível carregar os clientes.</p> : <>
      <details className="card panel-form"><summary>Novo cliente</summary><ClientForm shop={shop} /></details>
      <form className="card account-form panel-form" action={path}>
        <div className="form-columns">
          <label>Buscar por nome <input name="busca" maxLength={120} defaultValue={search} /></label>
          <label>Retorno inteligente <select name="retorno" defaultValue={returnDays}>
            <option value={0}>Todos os clientes</option>
            {returnOptions.map((days) => <option value={days} key={days}>Sem voltar há {days}+ dias</option>)}
          </select></label>
          <label>Ordenar <select name="ordem" defaultValue={sort}>
            {Object.entries(sorting).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select></label>
        </div>
        <button className="secondary" type="submit">Filtrar</button>
      </form>
      {chosen && <section className="card panel-form" id="historico">
        <h2>Histórico de {chosen.name}</h2>
        {history?.error ? <p role="alert">Não foi possível carregar o histórico.</p>
          : history?.data?.length ? <ul>{history.data.map((item) => <li key={item.id}>
            {item.starts_at.slice(0, 10).split("-").reverse().join("/")} · {item.service_name} · {states[item.state]}
          </li>)}</ul> : <p>Nenhum atendimento vinculado.</p>}
      </section>}
      {clients.length ? <ul className="cards">{clients.map((client) => <li className="card" key={client.id}>
        <h3>{client.name}</h3>
        <p>{client.active ? "Ativo" : "Inativo"}{client.phone && ` · ${client.phone}`}</p>
        <dl className="order-totals">
          <div><dt>Última visita</dt><dd>{client.last_visit?.split("-").reverse().join("/") ?? "Sem visita concluída"}</dd></div>
          <div><dt>Atendimentos concluídos</dt><dd>{client.visits}</dd></div>
          <div><dt>Total em comandas fechadas</dt><dd>{bookingCurrency.format(client.billed_cents / 100)}</dd></div>
        </dl>
        <details><summary>Editar cliente</summary><ClientForm shop={shop} client={client} /></details>
        <Link href={path + "?" + new URLSearchParams({ busca: search, retorno: String(returnDays), ordem: sort, cliente: client.id }) + "#historico"}>Ver histórico</Link>
      </li>)}</ul> : <p>Nenhum cliente encontrado.</p>}
      {clients.length === 100 && <p>Exibindo os primeiros 100 resultados. Use a busca para localizar outros clientes.</p>}
    </>}
  </section>;
}
