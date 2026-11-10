import { changeFollow } from "../cliente/actions";
import { pageIndex } from "../cliente/social";
import Link from "next/link";
import { httpsUrl } from "../../lib/business-profile";
import { isSegment, segments } from "../../lib/establishments";
import { supabaseServer } from "../../lib/supabase";

type Listing = { id: string; slug: string; name: string; city: string; segment: string; logo: string | null; cover: string | null };

export default async function Directory({ searchParams }: { searchParams: Promise<{ busca?: string; segmento?: string; pagina?: string; estado?: string }> }) {
  const { busca, segmento, pagina, estado } = await searchParams;
  const query = typeof busca === "string" ? busca.trim().slice(0, 120) : "";
  const segment = typeof segmento === "string" && isSegment(segmento) ? segmento : "";
  const supabase = await supabaseServer();
  const page = pageIndex(pagina);
  const path = (index: number) => "/estabelecimentos?" + new URLSearchParams({ busca:query, segmento:segment, pagina:String(index) });
  const [result, identity] = supabase ? await Promise.all([
    supabase.rpc("barberflow_search_directory",{ search_text:query,selected_segment:segment,page_number:page }),
    supabase.auth.getClaims(),
  ]) : [null,null];
  const user = identity?.data?.claims.sub;
  const listings = (result?.data ?? []) as Listing[];
  const shown = listings.slice(0,24);
  const follows = supabase && user && shown.length
    ? await supabase.from("barberflow_social_follow_shops").select("shop").eq("follower",user).in("shop",shown.map(item=>item.id)) : null;
  const followed = new Set((follows?.data ?? []).map(item=>item.shop));
  return <section className="container section public-directory">
    <header className="public-intro">
      <p className="eyebrow">Catálogo de beleza e bem-estar</p>
      <h1>Encontre profissionais e estabelecimentos</h1>
      <p>Busque na sua cidade e veja os serviços disponíveis para agendar.</p>
    </header>
    <form className="account-form card panel-form directory-search" action="/estabelecimentos">
      <label>Buscar por nome, cidade ou serviço <input name="busca" maxLength={120} defaultValue={query} /></label>
      <label>Segmento <select name="segmento" defaultValue={segment}>
        <option value="">Todos os segmentos</option>
        {Object.entries(segments).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <button className="primary" type="submit">Buscar</button>
    </form>
    {estado && <p role="status">{estado==="salvo" ? "Favoritos atualizados." : "Crie ou reative seu perfil para favoritar um estabelecimento."}</p>}
    {result?.error || !result ? <p role="alert">Não foi possível carregar o catálogo.</p>
      : listings.length ? <>
        <p role="status">{shown.length} {shown.length === 1 ? "estabelecimento nesta página" : "estabelecimentos nesta página"}</p>
        <ul className="cards directory-results">{shown.map((item) => {
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
              <div className="account-links">
                <Link href={`/estabelecimento/${item.slug}/agendar`}>Agendar</Link>
                {user && <><Link href={`/cliente?loja=${item.id}`}>Publicações</Link><form action={changeFollow.bind(null,path(page),item.id,true,followed.has(item.id))}><button className="secondary">{followed.has(item.id) ? "Remover favorito" : "Favoritar"}</button></form></>}
              </div>
            </div>
          </li>;
        })}</ul>
      </> : <p className="card">Nenhum estabelecimento encontrado. Tente outra cidade, nome ou segmento.</p>}
    {(page>0 || listings.length>24) && <nav className="account-links" aria-label="Páginas do catálogo">{page>0 && <Link href={path(page-1)}>Anterior</Link>}{listings.length>24 && <Link href={path(page+1)}>Próxima</Link>}</nav>}
  </section>;
}
