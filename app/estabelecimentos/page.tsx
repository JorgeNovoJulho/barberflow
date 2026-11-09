import Link from "next/link";
import { httpsUrl } from "../../lib/business-profile";
import { isSegment, segments } from "../../lib/establishments";
import { supabaseServer } from "../../lib/supabase";

type Listing = { slug: string; name: string; city: string; segment: string; logo: string | null; cover: string | null };

export default async function Directory({ searchParams }: { searchParams: Promise<{ busca?: string; segmento?: string }> }) {
  const { busca, segmento } = await searchParams;
  const query = typeof busca === "string" ? busca.trim().slice(0, 120) : "";
  const segment = typeof segmento === "string" && isSegment(segmento) ? segmento : "";
  const supabase = await supabaseServer();
  const result = supabase && await supabase.rpc("barberflow_public_directory");
  const listings = ((result?.data ?? []) as Listing[]).filter((item) =>
    (!segment || item.segment === segment) && (!query || `${item.name} ${item.city}`.toLowerCase().includes(query.toLowerCase())));
  return <section className="container section public-directory">
    <header className="public-intro">
      <p className="eyebrow">Catálogo de beleza e bem-estar</p>
      <h1>Encontre profissionais e estabelecimentos</h1>
      <p>Busque na sua cidade e veja os serviços disponíveis para agendar.</p>
    </header>
    <form className="account-form card panel-form directory-search" action="/estabelecimentos">
      <label>Buscar por nome ou cidade <input name="busca" maxLength={120} defaultValue={query} /></label>
      <label>Segmento <select name="segmento" defaultValue={segment}>
        <option value="">Todos os segmentos</option>
        {Object.entries(segments).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <button className="primary" type="submit">Buscar</button>
    </form>
    {result?.error || !result ? <p role="alert">Não foi possível carregar o catálogo.</p>
      : listings.length ? <>
        <p role="status">{listings.length} {listings.length === 1 ? "estabelecimento encontrado" : "estabelecimentos encontrados"}</p>
        <ul className="cards directory-results">{listings.map((item) => {
          const logo = httpsUrl(item.logo ?? undefined);
          const cover = httpsUrl(item.cover ?? undefined);
          return <li key={item.slug} className={`card directory-card${cover ? " directory-card-with-cover" : ""}`}>
            {cover && <img className="directory-banner" src={cover} alt="" loading="lazy" />}
            <div className="directory-card-content">
              <div className="directory-brand" aria-hidden="true">
                <span>{item.name.trim().slice(0, 2).toUpperCase()}</span>
                {logo && <img src={logo} alt="" loading="lazy" />}
              </div>
              <div className="directory-card-title">
                <p className="eyebrow">{isSegment(item.segment) ? segments[item.segment] : item.segment}</p>
                <h2>{item.name}</h2>
                <p>{item.city}</p>
              </div>
              <Link className="primary directory-services" href={`/estabelecimento/${item.slug}`}
                aria-label={`Ver serviços de ${item.name}`}>Ver serviços <span aria-hidden="true">↗</span></Link>
            </div>
          </li>;
        })}</ul>
      </> : <p className="card">Nenhum estabelecimento encontrado. Tente outra cidade, nome ou segmento.</p>}
  </section>;
}
