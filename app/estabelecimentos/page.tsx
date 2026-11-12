import { isUuid } from "../../lib/establishments";
import { DirectoryDistance, DirectoryLocation } from "./directory-location";
import { DirectoryAction } from "./directory-action";
import { coordinatesFromMap, parseCoordinates } from "../../lib/directory-distance";
import { changeFavorite, changeFollow } from "../cliente/actions";
import { pageIndex } from "../cliente/social";
import Link from "next/link";
import { httpsUrl } from "../../lib/business-profile";
import { isSegment, segments } from "../../lib/establishments";
import { supabaseServer } from "../../lib/supabase";

type Listing = { id: string; slug: string; name: string; city: string; segment: string; logo: string | null; cover: string | null };

export default async function Directory({ searchParams }: { searchParams: Promise<{ busca?: string; segmento?: string; pagina?: string; estado?: string; origem?: string; estabelecimento?: string }> }) {
  const { busca, segmento, pagina, estado, origem, estabelecimento } = await searchParams;
  const feedShop = isUuid(estabelecimento ?? "") ? estabelecimento : undefined;
  const query = typeof busca === "string" ? busca.trim().slice(0, 120) : "";
  const segment = typeof segmento === "string" && isSegment(segmento) ? segmento : "";
  const supabase = await supabaseServer();
  const page = pageIndex(pagina);
  const path = (index: number) => "/estabelecimentos?" + new URLSearchParams({ busca:query, segmento:segment, pagina:String(index), ...(origem === "feed" ? { origem } : {}), ...(feedShop ? { estabelecimento: feedShop } : {}) });
  const [result, identity] = supabase ? await Promise.all([
    supabase.rpc("barberflow_search_directory",{ search_text:query,selected_segment:segment,page_number:page }),
    supabase.auth.getClaims(),
  ]) : [null,null];
  const user = identity?.data?.claims.sub;
  const listings = (result?.data ?? []) as Listing[];
  const shown = listings.slice(0,24);
  const [follows, favorites, maps] = supabase && shown.length ? await Promise.all([
    user ? supabase.from("barberflow_social_follow_shops").select("shop").eq("follower",user).in("shop",shown.map(item=>item.id)) : null,
    user ? supabase.from("barberflow_social_favorite_shops").select("shop").eq("follower",user).in("shop",shown.map(item=>item.id)) : null,
    supabase.rpc("barberflow_directory_map_links",{shops:shown.map(item=>item.id)}),
  ]) : [null,null,null];
  const followed = new Set((follows?.data ?? []).map(item=>item.shop));
  const favorited = new Set((favorites?.data ?? []).map(item=>item.shop));
  const coordinates = new Map<string,ReturnType<typeof coordinatesFromMap>>((maps?.data ?? []).map((row:{id:string;map_link:string|null;coordinates:string|null})=>[row.id,parseCoordinates(row.coordinates) ?? coordinatesFromMap(row.map_link)]));
  return <section className="container section public-directory">
    <header className="public-intro">
      <p className="eyebrow">Catálogo de beleza e bem-estar</p>
      <h1>Encontre profissionais e estabelecimentos</h1>
      <p>Busque na sua cidade e veja os serviços disponíveis para agendar.</p>
    </header>
    {feedShop && <Link href={"/cliente?estabelecimento=" + feedShop}>Voltar ao Feed</Link>}
    {origem === "feed" && <Link href="/cliente">Voltar aos primeiros passos</Link>}
    <form className="account-form card panel-form directory-search" action="/estabelecimentos">
      {feedShop && <input type="hidden" name="estabelecimento" value={feedShop} />}
      {origem === "feed" && <input type="hidden" name="origem" value="feed" />}
      <label>Buscar por nome, cidade ou serviço <input name="busca" maxLength={120} defaultValue={query} /></label>
      <label>Segmento <select name="segmento" defaultValue={segment}>
        <option value="">Todos os segmentos</option>
        {Object.entries(segments).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <button className="primary" type="submit">Buscar</button>
    </form>
    {estado && <p role={estado==="salvo" ? "status" : "alert"} data-feedback={estado==="salvo" ? "success" : "warning"}>{estado==="salvo" ? "Lista atualizada." : "Complete ou reative seu perfil para seguir ou favoritar um estabelecimento."}</p>}
    {result?.error || !result ? <p role="alert">Não foi possível carregar o catálogo.</p>
      : listings.length ? <>
        <p role="status" data-feedback-ignore>{shown.length} {shown.length === 1 ? "estabelecimento nesta página" : "estabelecimentos nesta página"}</p>
        <DirectoryLocation available={[...coordinates.values()].some(Boolean)}><ul className="cards directory-results">{shown.map((item) => {
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
                <DirectoryDistance destination={coordinates.get(item.id) ?? null} />
              </div>
              <div className="directory-actions">
                <DirectoryAction kind="services" label="Ver serviços" href={`/estabelecimento/${item.slug}`} />
                <DirectoryAction kind="calendar" label="Agendar" href={`/estabelecimento/${item.slug}/agendar`} />
                {user && <>
                  <DirectoryAction kind="posts" label="Publicações" href={`/cliente?loja=${item.id}` + (feedShop ? "&estabelecimento=" + feedShop : "")} />
                  <DirectoryAction kind={followed.has(item.id) ? "unfollow" : "follow"} label={followed.has(item.id) ? "Deixar de seguir" : "Seguir"} pressed={followed.has(item.id)} action={changeFollow.bind(null,path(page),item.id,true,followed.has(item.id))} />
                  <DirectoryAction kind="favorite" label={favorited.has(item.id) ? "Remover favorito" : "Favoritar"} pressed={favorited.has(item.id)} action={changeFavorite.bind(null,path(page),item.id,favorited.has(item.id))} />
                </>}
              </div>
            </div>
          </li>;
        })}</ul></DirectoryLocation>
      </> : <p className="card">Nenhum estabelecimento encontrado. Tente outra cidade, nome ou segmento.</p>}
    {(page>0 || listings.length>24) && <nav className="account-links" aria-label="Páginas do catálogo">{page>0 && <Link href={path(page-1)}>Anterior</Link>}{listings.length>24 && <Link href={path(page+1)}>Próxima</Link>}</nav>}
  </section>;
}
