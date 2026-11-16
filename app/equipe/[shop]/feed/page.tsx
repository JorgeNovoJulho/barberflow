import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { deleteSocialPhoto } from "../../../cliente/actions";
import { PhotoForm } from "../../../cliente/photo-form";
import { mediaLinks, pageIndex, socialSession } from "../../../cliente/social";

export default async function ShopFeed({ params, searchParams }: {
  params: Promise<{ shop: string }>;
  searchParams: Promise<{ pagina?: string; estado?: string }>;
}) {
  const { shop } = await params;
  if (!isUuid(shop)) notFound();
  const { supabase, user } = await socialSession();
  const { data: allowed } = await supabase.rpc("barberflow_can_manage_shop_feed", { shop });
  if (allowed !== true) notFound();

  const { pagina, estado } = await searchParams;
  const page = pageIndex(pagina);
  const pageSize = 12;
  const base = `/equipe/${shop}/feed`;
  const pagePath = (index: number) => index ? `${base}?pagina=${index}` : base;
  const { data, error } = await supabase.from("barberflow_social_photos")
    .select("id,author,caption,audience,created_at,object_path,extra_photos")
    .eq("shop", shop).order("created_at", { ascending: false }).order("id")
    .range(page * pageSize, (page + 1) * pageSize);
  const posts = (data ?? []).slice(0, pageSize);
  const media = await mediaLinks(supabase, posts.flatMap(post => [post.object_path, ...post.extra_photos]));

  return <section className="container section">
    <Link className="secondary finance-tab command-action" data-tone="blue" href={`/equipe/${shop}/meu-painel`}>Voltar ao Meu dia</Link>
    <h1>Feed da página pública</h1>
    {estado === "salvo" && <p role="status">Alteração salva.</p>}
    {estado === "falha" && <p role="alert">Não foi possível salvar a alteração.</p>}
    <PhotoForm path={base} shop={shop} publicPage />
    <h2>Postagens da loja</h2>
    {error ? <p role="alert">Não foi possível carregar as postagens.</p> : !posts.length && <p>Nenhuma postagem nesta página.</p>}
    <ul className="cards">
      {posts.map(post => <li className="card" key={post.id}>
        <p>{post.caption || "Publicação com fotos"}</p>
        {[post.object_path, ...post.extra_photos].filter(path => media.has(path)).map(path =>
          <img key={path} src={media.get(path)} width={96} alt="Foto da publicação" loading="lazy" />)}
        <details>
          <summary>Editar publicação</summary>
          <PhotoForm path={pagePath(page)} shop={shop} photo={post} manageMedia={post.author === user.id} />
        </details>
        <form action={deleteSocialPhoto.bind(null, pagePath(page), post.id, shop)}>
          <label><input name="confirm" type="checkbox" required /> Confirmar exclusão</label>
          <button className="secondary finance-tab command-action" data-tone="red">Excluir publicação</button>
        </form>
      </li>)}
    </ul>
    {page > 0 && <Link className="secondary" href={pagePath(page - 1)}>Anterior</Link>}
    {(data?.length ?? 0) > pageSize && <Link className="secondary" href={pagePath(page + 1)}>Próxima</Link>}
  </section>;
}
