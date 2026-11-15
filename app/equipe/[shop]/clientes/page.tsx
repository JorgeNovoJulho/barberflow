import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { clientPhotoLinks } from "../../../../lib/client-photos";
import { supabaseServer } from "../../../../lib/supabase";
import { ClientForm, type Client } from "../../../painel/[establishmentId]/clientes/client-form";
import { PanelStatus } from "../../../painel/status";

import { ClientIdentity, ClientVisitHistory, type VisitDetails } from "../../../painel/[establishmentId]/clientes/client-visit-history";

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
  const query = supabase.from("barberflow_clients").select("id,name,phone,preferences,notes,active,email,instagram,facebook,tiktok,youtube,photo_path,client_number,created_at")
    .eq("establishment_id", shop).order("name").order("id").limit(100);
  if (search) query.ilike("name", "%" + search.replace(/[\\%_]/g, "\\$&") + "%");
  const { data, error } = await query;
  const clients = (data ?? []) as Client[];
  const photos = await clientPhotoLinks(supabase, clients);
  const selected = clients.find(({ id }) => id === cliente);
  const history = selected ? await supabase.rpc("barberflow_client_visit_details", { shop, client: selected.id }) : null;


  return <section className="container section">
    <nav className="account-links" aria-label="Equipe"><Link className="secondary finance-tab command-action" data-tone="blue" href={base + "/meu-painel"}>Voltar ao Meu dia</Link><Link href={base}>Agenda da equipe</Link></nav>
    <h1>Clientes da equipe</h1>
    <PanelStatus status={estado} />
    <details className="card panel-form"><summary>Novo cliente</summary><ClientForm shop={shop} team /></details>
    <form className="agenda-date" action={path}>
      <label>Buscar por nome <input name="busca" maxLength={120} defaultValue={search} /></label>
      <button className="secondary" type="submit">Buscar</button>
    </form>
    {error ? <p role="alert">Não foi possível consultar os clientes.</p> : clients.length ? <ul className="cards">{clients.map((client, index) =>
      <li className="card team-professional-card" data-tone={index % 4} key={client.id} id={`cliente-${client.id}`}>
      <ClientIdentity client={client} photo={photos.get(client.photo_path ?? "")} />
      <details><summary className="secondary finance-tab command-action payment-action" data-tone="purple">Editar cliente</summary><ClientForm shop={shop} client={client} photo={photos.get(client.photo_path ?? "")} team /></details>
      <Link className="secondary finance-tab command-action payment-action" data-tone="blue" href={path + "?" + new URLSearchParams({ busca: search, cliente: client.id }) + `#cliente-${client.id}`}>Ver histórico</Link>
        {selected?.id === client.id && <ClientVisitHistory name={client.name} details={history?.data as VisitDetails | null} error={!!history?.error} />}
    </li>)}</ul> : <p>Nenhum cliente encontrado.</p>}
    {clients.length === 100 && <p>Exibindo os primeiros 100 resultados. Use a busca para localizar outros clientes.</p>}
  </section>;
}
