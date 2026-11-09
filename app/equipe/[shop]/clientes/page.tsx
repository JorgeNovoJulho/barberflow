import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { ClientForm, type Client } from "../../../painel/[establishmentId]/clientes/client-form";
import { PanelStatus } from "../../../painel/status";

const states: Record<string, string> = {
  pending: "Aguardando confirmação", scheduled: "Agendado", completed: "Concluído",
  cancelled: "Cancelado", no_show: "Não compareceu",
};

export default async function TeamClients({ params, searchParams }: {
  params: Promise<{ shop: string }>; searchParams: Promise<{ busca?: string; cliente?: string; estado?: string }>;
}) {
  const { shop } = await params;
  if (!isUuid(shop)) notFound();
  const base = `/equipe/${shop}`;
  const path = base + "/clientes";
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  const access = await supabase.rpc("barberflow_team_can_edit_clients", { shop });
  if (access.error || access.data !== true) notFound();

  const { busca, cliente, estado } = await searchParams;
  const search = typeof busca === "string" ? busca.trim().slice(0, 120) : "";
  const query = supabase.from("barberflow_clients").select("id,name,phone,preferences,notes,active")
    .eq("establishment_id", shop).order("name").order("id").limit(100);
  if (search) query.ilike("name", "%" + search.replace(/[\\%_]/g, "\\$&") + "%");
  const { data, error } = await query;
  const clients = (data ?? []) as Client[];
  const selected = clients.find(({ id }) => id === cliente);
  const history = selected ? await supabase.rpc("barberflow_team_client_history", { shop, client: selected.id }) : null;
  const visits = (history?.data ?? []) as { id: string; service_name: string; state: string; starts_at: string }[];

  return <section className="container section">
    <nav className="account-links" aria-label="Equipe"><Link href="/painel">Painel</Link><Link href={base}>Agenda da equipe</Link></nav>
    <h1>Clientes da equipe</h1>
    <PanelStatus status={estado} />
    <details className="card panel-form"><summary>Novo cliente</summary><ClientForm shop={shop} team /></details>
    <form className="agenda-date" action={path}>
      <label>Buscar por nome <input name="busca" maxLength={120} defaultValue={search} /></label>
      <button className="secondary" type="submit">Buscar</button>
    </form>
    {selected && <section className="card panel-form" id="historico">
      <h2>Histórico de {selected.name}</h2>
      {history?.error ? <p role="alert">Não foi possível consultar o histórico.</p> : visits.length ? <ul>{visits.map((item) => <li key={item.id}>
        {item.starts_at.slice(0, 10).split("-").reverse().join("/")} · {item.service_name} · {states[item.state]}
      </li>)}</ul> : <p>Nenhum atendimento vinculado.</p>}
    </section>}
    {error ? <p role="alert">Não foi possível consultar os clientes.</p> : clients.length ? <ul className="cards">{clients.map((client) => <li className="card" key={client.id}>
      <h2>{client.name}</h2>
      <p>{client.active ? "Ativo" : "Inativo"}{client.phone && ` · ${client.phone}`}</p>
      <details><summary>Editar cliente</summary><ClientForm shop={shop} client={client} team /></details>
      <Link href={path + "?" + new URLSearchParams({ busca: search, cliente: client.id }) + "#historico"}>Ver histórico</Link>
    </li>)}</ul> : <p>Nenhum cliente encontrado.</p>}
    {clients.length === 100 && <p>Exibindo os primeiros 100 resultados. Use a busca para localizar outros clientes.</p>}
  </section>;
}
