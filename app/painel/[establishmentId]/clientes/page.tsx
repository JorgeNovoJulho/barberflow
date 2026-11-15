import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { clientPhotoLinks } from "../../../../lib/client-photos";
import { supabaseServer } from "../../../../lib/supabase";
import { bookingCurrency } from "../../../../lib/public-booking";
import { authOrigin } from "../../../../lib/auth-path";
import { whatsappUrl } from "../../../../lib/business-profile";
import { PanelStatus } from "../../status";
import { ClientForm, type Client } from "./client-form";

type DirectoryClient = Client & { last_visit: string | null; visits: number; billed_cents: number };
const returnOptions = [15, 20, 30, 45, 60, 90];
const sorting = { visit: "Última visita", spend: "Maior faturamento", recent: "Cadastro recente", name: "Nome" };


import { ClientIdentity, ClientVisitHistory, type VisitDetails } from "./client-visit-history";

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
  const { data: establishment, error: shopError } = await supabase.from("barberflow_establishments").select("name,slug,published").eq("id", shop).maybeSingle();
  if (shopError) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!establishment) notFound();

  const { estado, busca, cliente, retorno, ordem } = await searchParams;
  const search = typeof busca === "string" ? busca.trim().slice(0, 120) : "";
  const returnDays = returnOptions.find((days) => String(days) === retorno) ?? 0;
  const sort = typeof ordem === "string" && Object.hasOwn(sorting, ordem) ? ordem : "visit";
  const { data, error } = await supabase.rpc("barberflow_client_directory", {
    shop, search_text: search, return_days: returnDays, sort_by: sort,
  });
  const directory = (data ?? []) as DirectoryClient[];
  const metadata = directory.length ? await supabase.from("barberflow_clients").select("id,client_number,created_at")
    .eq("establishment_id", shop).in("id", directory.map(client => client.id)) : null;
  const byId = new Map((metadata?.data ?? []).map(item => [item.id, item]));
  const clients = directory.map(client => ({ ...client, ...byId.get(client.id) }));
  const photos = await clientPhotoLinks(supabase, clients);
  const origin = authOrigin();
  const bookingLink = establishment.published && establishment.slug && origin.startsWith("https://")
    ? new URL(`/estabelecimento/${establishment.slug}/agendar`, origin).href : "";
  const chosen = cliente && isUuid(cliente) ? clients.find((item) => item.id === cliente) : undefined;
  const history = chosen ? await supabase.rpc("barberflow_client_visit_details", { shop, client: chosen.id }) : null;

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
      {clients.length ? <ul className="cards">{clients.map((client, index) => {
        const name = client.name.trim().split(/\s+/)[0];
        const message = `Olá, ${name}! Aqui é da equipe de ${establishment.name}. Gostaria de agendar seu próximo atendimento?`;
        const contact = client.active && whatsappUrl(client.phone, [message, bookingLink].filter(Boolean).join("\n"));
        return <li className="card team-professional-card" data-tone={index % 4} key={client.id} id={`cliente-${client.id}`}>
        <ClientIdentity client={client} photo={photos.get(client.photo_path ?? "")} />
        <dl className="order-totals">
          <div><dt>Última visita</dt><dd>{client.last_visit?.split("-").reverse().join("/") ?? "Sem visita concluída"}</dd></div>
          <div><dt>Atendimentos concluídos</dt><dd>{client.visits}</dd></div>
          <div><dt>Total em comandas fechadas</dt><dd>{bookingCurrency.format(client.billed_cents / 100)}</dd></div>
        </dl>
        <details><summary>Editar cliente</summary><ClientForm shop={shop} client={client} photo={photos.get(client.photo_path ?? "")} /></details>
        <Link className="secondary finance-tab command-action" data-tone="blue" href={path + "?" + new URLSearchParams({ busca: search, retorno: String(returnDays), ordem: sort, cliente: client.id }) + `#cliente-${client.id}`}>Ver histórico</Link>
        {chosen?.id === client.id && <ClientVisitHistory name={chosen.name} details={history?.data as VisitDetails | null} error={!!history?.error} />}
        {contact && <p><a href={contact} target="_blank" rel="noopener noreferrer">Abrir WhatsApp de {name}</a></p>}
      </li>;
      })}</ul> : <p>Nenhum cliente encontrado.</p>}
      {clients.length === 100 && <p>Exibindo os primeiros 100 resultados. Use a busca para localizar outros clientes.</p>}
    </>}
  </section>;
}
