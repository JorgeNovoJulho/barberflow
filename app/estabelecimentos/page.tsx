import Link from "next/link";
import { isSegment, segments } from "../../lib/establishments";
import { supabaseServer } from "../../lib/supabase";

type Listing = { slug: string; name: string; city: string; segment: string };

export default async function Directory({ searchParams }: { searchParams: Promise<{ busca?: string; segmento?: string }> }) {
  const { busca, segmento } = await searchParams;
  const query = typeof busca === "string" ? busca.trim().slice(0, 120) : "";
  const segment = typeof segmento === "string" && isSegment(segmento) ? segmento : "";
  const supabase = await supabaseServer();
  const result = supabase && await supabase.rpc("barberflow_public_directory");
  const listings = ((result?.data ?? []) as Listing[]).filter((item) =>
    (!segment || item.segment === segment) && (!query || `${item.name} ${item.city}`.toLowerCase().includes(query.toLowerCase())));
  return <section className="container section">
    <p className="eyebrow">Beleza e bem-estar</p>
    <h1>Encontre profissionais e estabelecimentos</h1>
    <form className="account-form card panel-form" action="/estabelecimentos">
      <label>Buscar por nome ou cidade <input name="busca" maxLength={120} defaultValue={query} /></label>
      <label>Segmento <select name="segmento" defaultValue={segment}>
        <option value="">Todos os segmentos</option>
        {Object.entries(segments).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <button className="primary" type="submit">Buscar</button>
    </form>
    {result?.error || !result ? <p role="alert">Não foi possível carregar o catálogo.</p>
      : listings.length ? <ul className="cards">{listings.map((item) => <li key={item.slug} className="card">
        <h2>{item.name}</h2><p>{item.city} · {isSegment(item.segment) ? segments[item.segment] : item.segment}</p>
        <Link className="secondary" href={`/estabelecimento/${item.slug}`}>Ver serviços</Link>
      </li>)}</ul> : <p>Nenhum estabelecimento encontrado.</p>}
  </section>;
}
