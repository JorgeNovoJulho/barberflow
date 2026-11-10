import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "../../lib/establishments";
import { httpsUrl, socialUrl } from "../../lib/business-profile";
import { signOut } from "../auth/actions";
import { blockSocialProfile, changeFavorite, changeFollow, changeLike, commentPhoto, deleteSocialPhoto, freezeSocial, requestDeletion, reviewSocialShop } from "./actions";
import { SocialProfileForm } from "./profile-form";
import { ProfilePresence } from "./profile-presence";
import { ProductGallery } from "../painel/[establishmentId]/estoque/product-gallery";
import { SocialIcon } from "./social-icon";
import { PhotoForm } from "./photo-form";
import { mediaLinks, pageIndex, socialSession, socials } from "./social";

type Photo = { id:string; author:string; shop:string|null; object_path:string; extra_photos?:string[]; caption:string; audience:string; promotion:boolean };
type Person = { user_id: string; username: string; avatar: string };
type Shop = { id: string; slug: string; name: string; city: string; logo: string | null };
const collectionLabels = {
  seguindo: "Seguindo", seguidores: "Seguidores", "lojas-seguidas": "Estabelecimentos seguidos",
  favoritos: "Estabelecimentos favoritos", bloqueados: "Usuários bloqueados",
};


export default async function ClientPage({ searchParams }: {
  searchParams: Promise<{ aba?:string; perfil?:string; loja?:string; foto?:string; pagina?:string; estado?:string }>;
}) {
  const { supabase,user } = await socialSession();
  const params = await searchParams;
  const page = pageIndex(params.pagina);
  const target = params.perfil && isUuid(params.perfil) ? params.perfil : null;
  const shop = params.loja && isUuid(params.loja) ? params.loja : null;
  const photo = params.foto && isUuid(params.foto) ? params.foto : null;
  const collection = params.aba && Object.hasOwn(collectionLabels, params.aba) ? params.aba as keyof typeof collectionLabels : null;
  const view = collection ?? (photo ? "foto" : shop ? "loja" : target ? "perfil-publico" : ["perfil","notificacoes","pessoas"].includes(params.aba ?? "") ? params.aba! : "feed");
  const query = new URLSearchParams();
  if (params.aba) query.set("aba",params.aba);
  if (target) query.set("perfil",target);
  if (shop) query.set("loja",shop);
  if (photo) query.set("foto",photo);
  const url = (index:number) => "/cliente?" + new URLSearchParams([...query,["pagina",String(index)]]);
  const path = url(page);
  const profileId = target ?? user.id;
  const profileTable = supabase.from("barberflow_social_profiles");
  const photos = supabase.from("barberflow_social_photos");
  const followTable = supabase.from(shop ? "barberflow_social_follow_shops" : "barberflow_social_follow_users");
  const [profileResult, postsResult, countsResult, followingResult, shopResult, servicesResult, directoryResult, noticesResult, deletionResult, generalResult, roleResult, connections, savedShops, presenceResult, blockedProfiles, summaryResult, shopFavorite, purchaseNotices] = await Promise.all([
    profileTable.select("username,avatar,banner,links,theme,frozen,revision").eq("user_id",profileId).maybeSingle(),
    view === "feed" ? supabase.rpc("barberflow_social_feed",{ page_number:page })
      : view === "foto" ? photos.select("*").eq("id",photo!)
      : ["loja","perfil","perfil-publico"].includes(view) ? (shop ? photos.select("*").eq("shop",shop) : photos.select("*").eq("author",profileId).is("shop",null))
        .order("created_at",{ ascending:false }).order("id").range(page*12,page*12+12) : null,
    view === "loja" ? supabase.rpc("barberflow_social_counts",{ profile:shop ? null : profileId,shop_id:shop }) : null,
    shop || (target && target!==user.id) ? followTable.select(shop ? "shop" : "target").eq("follower",user.id).eq(shop ? "shop" : "target",shop ?? target!).maybeSingle() : null,
    shop ? supabase.rpc("barberflow_social_shop_info",{ shop_id:shop }) : null,
    view === "perfil" ? supabase.rpc("barberflow_my_service_counts") : null,
    view === "pessoas" ? profileTable.select("user_id,username,avatar").neq("user_id",user.id).eq("frozen",false).order("username").order("user_id").range(page*12,page*12+12) : null,
    view === "notificacoes" ? supabase.rpc("barberflow_social_notices",{ page_number:page }) : null,
    view === "perfil" ? supabase.from("barberflow_account_deletion_requests").select("requested_at").eq("user_id",user.id).maybeSingle() : null,
    view === "feed" && page===0 ? supabase.from("barberflow_social_news").select("id,title,body").order("created_at",{ascending:false}).limit(5) : null,
    view === "feed" ? supabase.rpc("barberflow_account_kind") : null,
    collection === "seguindo" || collection === "seguidores"
      ? supabase.rpc("barberflow_social_connections", { profile: profileId, direction: collection === "seguindo" ? "following" : "followers", page_number: page }) : null,
    collection === "lojas-seguidas" || collection === "favoritos" || ((view === "perfil" || collection === "seguindo") && profileId === user.id)
      ? supabase.rpc("barberflow_saved_shops", { collection: collection === "favoritos" ? "favorites" : "following", page_number: page }) : null,
    shop || view === "perfil" || view === "perfil-publico"
      ? supabase.rpc("barberflow_profile_presence", { profile: shop ? null : profileId, shop_id: shop }) : null,
    collection === "bloqueados" ? supabase.rpc("barberflow_blocked_profiles", { page_number: page }) : null,
    view === "perfil" || view === "perfil-publico" ? supabase.rpc("barberflow_profile_summary",{ subject:profileId }) : null,
    shop ? supabase.from("barberflow_social_favorite_shops").select("shop").eq("follower",user.id).eq("shop",shop).maybeSingle() : null,
    view === "notificacoes" && page === 0 ? supabase.from("barberflow_showcase_orders")
      .select("id,shop_name,product_name,status").eq("buyer_id",user.id)
      .in("status",["paid","ready","denied"]).order("notice_at",{ascending:false}).limit(20) : null,
  ]);
  const profile = profileResult.data;
  const shopInfo = shopResult?.data as { name:string; slug:string; can_review:boolean } | null;
  if ((target && !profile && !profileResult.error) || (shop && !shopInfo && !shopResult?.error) || (photo && !postsResult?.data?.length && !postsResult?.error)) notFound();
  const posts = (postsResult?.data ?? []) as Photo[];
  const setup = view === "feed" && roleResult?.data === "cliente" && !profileResult.error && !(profile?.username && profile.avatar);
  const people: Person[] = connections?.data?.rows ?? directoryResult?.data ?? [];
  const shops: Shop[] = savedShops?.data ?? [];
  const blocked = (blockedProfiles?.data ?? []) as Pick<Person,"user_id"|"username">[];
  const notices = (noticesResult?.data ?? []) as { kind:string; photo:string; occurred:string; description:string }[];
  const imagesFor = (post: Photo) => [post.object_path, ...(post.extra_photos ?? [])].filter(Boolean);
  const summary = summaryResult?.data;
  const joined = summary?.joined && new Intl.DateTimeFormat("pt-BR", { month:"long", year:"numeric", timeZone:"America/Sao_Paulo" }).format(new Date(summary.joined));
  const [links, likes, comments, authors, likerRows] = await Promise.all([
    mediaLinks(supabase,[profile?.avatar ?? "",profile?.banner ?? "",...posts.slice(0,12).flatMap(p=>photo ? imagesFor(p) : imagesFor(p).slice(0,1)),...people.slice(0,12).map((p)=>p.avatar)]),
    photo ? supabase.from("barberflow_social_likes").select("actor",{ count:"exact",head:true }).eq("photo",photo) : null,
    photo ? supabase.from("barberflow_social_comments").select("id,actor,parent,body").eq("photo",photo).order("created_at",{ascending:false}).order("id").range(page*25,page*25+25) : null,
    posts.length ? supabase.from("barberflow_social_profiles").select("user_id,username").in("user_id",[...new Set(posts.map(p=>p.author))]) : null,
    photo ? supabase.from("barberflow_social_likes").select("actor").eq("photo",photo).order("created_at",{ascending:false}).order("actor").range(page*25,page*25+25) : null,
  ]);
  const likerIds = (likerRows?.data ?? []).slice(0,25).map(row=>row.actor);
  const likerProfiles = likerIds.length ? await profileTable.select("user_id,username").in("user_id",likerIds).eq("frozen",false) : null;
  const likerNames = new Map((likerProfiles?.data ?? []).map(row=>[row.user_id,row.username]));
  const liked = photo ? await supabase.from("barberflow_social_likes").select("photo").eq("photo",photo).eq("actor",user.id).maybeSingle() : null;
  const names = new Map((authors?.data ?? []).map((a)=>[a.user_id,a.username]));
  const more = Math.max(posts.length,people.length,shops.length,blocked.length)>12 || notices.length>25 || (comments?.data?.length ?? 0)>25 || (likerRows?.data?.length ?? 0)>25;
  const failed = [profileResult,postsResult,shopResult,servicesResult,directoryResult,noticesResult,purchaseNotices,comments,generalResult,roleResult,connections,savedShops,presenceResult,blockedProfiles,summaryResult,likerRows,likerProfiles].some(result=>result?.error);
  const title = setup ? "Primeiros passos" : collection ? collectionLabels[collection] : shopInfo?.name ?? (view==="perfil-publico" ? profile?.username : ({ perfil:"Meu perfil", pessoas:"Encontrar pessoas", notificacoes:"Notificações", foto:"Publicação", feed:"Meu feed" })[view as "feed"]) ?? "Área do cliente";
  return <div className="container workspace social-workspace">
    <aside className="workspace-rail"><nav className="workspace-modules" aria-label="Área do cliente">
      <Link href="/cliente">Feed</Link><Link href="/cliente?aba=perfil">Meu perfil</Link><Link href="/cliente?aba=pessoas">Encontrar pessoas</Link>
      <Link href="/estabelecimentos">Encontrar estabelecimentos</Link><Link href="/cliente?aba=lojas-seguidas">Estabelecimentos seguidos</Link><Link href="/cliente?aba=favoritos">Estabelecimentos favoritos</Link><Link href="/meus-agendamentos">Minhas reservas</Link>
      <Link href="/minhas-compras">Minhas compras</Link><Link href="/cliente?aba=notificacoes">Notificações</Link>
    </nav><form action={signOut}><button className="workspace-notices">Sair do sistema</button></form></aside>
    <section className="workspace-content section" data-social-theme={profile?.theme}>
      <h1>{title}</h1>
      {params.estado && <p role={params.estado==="salvo" ? "status" : "alert"} data-feedback={params.estado==="salvo" ? "success" : "warning"}>{params.estado==="salvo" ? "Alteração registrada." : "Não foi possível concluir. Confira os dados, a visibilidade e as permissões do perfil."}</p>}
      {failed && <p role="alert">Parte do conteúdo não pôde ser carregada.</p>}
      {setup && <>
        <p>Salve um nome de usuário e uma foto para concluir. O banner e as redes sociais são opcionais.</p>
        <SocialProfileForm key={profile?.revision ?? "new"} profile={profile ?? undefined}
          avatar={links.get(profile?.avatar ?? "")} banner={links.get(profile?.banner ?? "")} setup />
        <section className="card panel-form"><h2>Descubra estabelecimentos (opcional)</h2>
          <form className="account-form" action="/estabelecimentos">
            <input type="hidden" name="origem" value="feed" />
            <label>Busque por nome, cidade ou serviço <input name="busca" maxLength={120} /></label>
            <button className="secondary">Buscar estabelecimentos</button>
          </form>
        </section>
      </>}
      {view==="feed" && !setup && <>
        {!profile && <p><Link href="/cliente?aba=perfil">Crie seu perfil para publicar e interagir.</Link></p>}
        <form className="account-form card panel-form" action="/estabelecimentos"><label>Busque estabelecimentos por nome, cidade ou serviço <input name="busca" maxLength={120} required /></label><button className="primary">Buscar</button></form>
        {generalResult?.data?.length ? <section><h2>Novidades do BARBERFLOW</h2>{generalResult.data.map((item)=><article key={item.id} className="card"><h3>{item.title}</h3><p>{item.body}</p></article>)}</section> : null}
        {profile && !profile.frozen && <PhotoForm path={path} shop={null} />}
        <h2>Publicações</h2>{!posts.length && <p>Nenhuma publicação disponível no momento.</p>}
      </>}
      {["perfil","perfil-publico"].includes(view) && <>
        {profile && <div className="card social-profile profile-feature">
          {links.get(profile.banner) && <img className="social-banner" src={links.get(profile.banner)} alt="Banner do perfil" />}
          {links.get(profile.avatar) && <img className="social-avatar" src={links.get(profile.avatar)} alt="" />}
          <div className="profile-feature-body"><h2>{profile.username}</h2>
          {joined && <p className="profile-member">No BARBERFLOW desde {joined}</p>}
          {presenceResult?.data && <ProfilePresence key={profileId} initial={presenceResult.data} profile={profileId} shop={null} />}
          <div className="profile-stats">
            <Link href={`/cliente?aba=seguidores&perfil=${profileId}`}><strong>{summary?.followers ?? "—"}</strong> Seguidores</Link>
            <Link href={`/cliente?aba=seguindo&perfil=${profileId}`}><strong>{summary?.following ?? "—"}</strong> Seguindo</Link>
          </div>
          <div className="profile-networks">{Object.entries(socials).map(([label,hosts])=> {
            const link = socialUrl(profile.links?.[label],hosts);
            return link && <Link key={label} href={link} rel="noreferrer"><SocialIcon name={label} />{label}</Link>;
          })}</div>
          {target && target!==user.id && <form action={changeFollow.bind(null,path,target,false,!!followingResult?.data)}><button className="secondary">{followingResult?.data ? "Deixar de seguir" : "Seguir"}</button></form>}
          {target && target!==user.id && <form action={blockSocialProfile.bind(null,target,true)}><button className="secondary">Bloquear usuário</button></form>}
          </div>
        </div>}
        {view==="perfil" && <>
          <SocialProfileForm key={profile?.revision ?? "new"} profile={profile ?? undefined}
            avatar={links.get(profile?.avatar ?? "")} banner={links.get(profile?.banner ?? "")} setup={false} />
          <p><Link href="/cliente?aba=bloqueados">Gerenciar usuários bloqueados</Link></p>
          {profile && <form action={freezeSocial.bind(null,!profile.frozen)}><button className="secondary">{profile.frozen ? "Reativar perfil" : "Congelar perfil"}</button></form>}
          <details className="card panel-form"><summary>Solicitar exclusão da conta</summary>
            {deletionResult?.data ? <p>Sua solicitação foi registrada para análise.</p> : <form className="account-form" action={requestDeletion}>
              <label><input name="confirm" type="checkbox" required /> Confirmo que quero solicitar a exclusão da minha conta.</label>
              <button className="secondary">Registrar solicitação</button>
            </form>}
          </details>
          <section className="card panel-form"><h2>Serviços que mais uso</h2>
            {servicesResult?.data?.length ? servicesResult.data.map((item:{service_name:string;visits:number})=>
              <p key={item.service_name}>{item.service_name} · {item.visits} <meter min={0} max={Number(servicesResult.data[0].visits)} value={item.visits} aria-label={item.service_name} /></p>) : <p>Os serviços concluídos vão aparecer aqui.</p>}
          </section>
          {profile && !profile.frozen && <details className="card panel-form profile-upload"><summary>Enviar fotos</summary><PhotoForm path={path} shop={null} /></details>}
          <div className="account-links"><Link className="secondary" href="/cliente?aba=lojas-seguidas">Estabelecimentos seguidos</Link>
            <Link className="secondary" href="/cliente?aba=favoritos">Estabelecimentos favoritos</Link></div>
        </>}
      </>}
      {shop && shopInfo && <div className="card panel-form">
        {presenceResult?.data && <ProfilePresence key={shop} initial={presenceResult.data} profile={null} shop={shop} />}
        <p>{countsResult?.data?.followers ?? 0} seguidores</p>
        <div className="account-links"><Link href={"/estabelecimento/"+shopInfo.slug}>Visitar estabelecimento</Link><Link href={"/estabelecimento/"+shopInfo.slug+"/agendar"}>Agendar</Link></div>
        <form action={changeFollow.bind(null,path,shop,true,!!followingResult?.data)}><button className="secondary">{followingResult?.data ? "Deixar de seguir" : "Seguir estabelecimento"}</button></form>
        <form action={changeFavorite.bind(null,path,shop,!!shopFavorite?.data)}><button className="secondary">{shopFavorite?.data ? "Remover favorito" : "Favoritar"}</button></form>
        {shopInfo.can_review && <form className="account-form panel-form" action={reviewSocialShop.bind(null,shop)}>
          <label>Avaliação <select name="stars" defaultValue="5">{[0,1,2,3,4,5].map(star=><option key={star} value={star}>{star} estrelas</option>)}</select></label>
          <label>Comentário <textarea name="message" maxLength={500} /></label><button className="secondary">Enviar avaliação</button>
        </form>}
      </div>}
      {connections?.data && <p>{connections.data.count} {collection === "seguidores" ? "seguidores" : "perfis seguidos"}</p>}
      {(view==="pessoas" || connections?.data) && (people.length ? <ul className="cards">{people.slice(0,12).map(person=><li className="card" key={person.user_id}>
        {links.get(person.avatar) && <img className="social-avatar social-avatar-small" width={56} height={56} src={links.get(person.avatar)} alt="" loading="lazy" />}
        <Link href={"/cliente?perfil="+person.user_id}>{person.username}</Link>
        {collection === "seguindo" && profileId === user.id && <form action={changeFollow.bind(null,path,person.user_id,false,true)}>
          <button className="secondary">Deixar de seguir</button>
        </form>}
      </li>)}</ul> : <p>Nenhum perfil disponível.</p>)}
      {(collection === "lojas-seguidas" || collection === "favoritos" || ((view === "perfil" || collection === "seguindo") && profileId === user.id)) && <>
        <h2>{collection === "favoritos" ? "Estabelecimentos favoritos" : "Estabelecimentos seguidos"}</h2>
        {shops.length ? <ul className="cards">{shops.slice(0,12).map(item=><li className="card" key={item.id}>
        {httpsUrl(item.logo ?? undefined) && <img className="social-avatar social-avatar-small" src={item.logo!} alt="" loading="lazy" width={56} height={56} />}
        <Link href={"/cliente?loja="+item.id}>{item.name}</Link><p>{item.city}</p>
        <form action={collection === "favoritos" ? changeFavorite.bind(null,path,item.id,true) : changeFollow.bind(null,path,item.id,true,true)}>
          <button className="secondary">{collection === "favoritos" ? "Remover favorito" : "Deixar de seguir"}</button>
        </form>
      </li>)}</ul> : <p>Nenhum estabelecimento nesta lista.</p>}</>}
      {collection === "bloqueados" && (blocked.length ? <ul className="cards">{blocked.slice(0,12).map(person=><li className="card" key={person.user_id}>
        <p>{person.username}</p><form action={blockSocialProfile.bind(null,person.user_id,false)}><button className="secondary">Desbloquear usuário</button></form>
      </li>)}</ul> : <p>Nenhum usuário bloqueado.</p>)}
      {purchaseNotices?.data?.length ? <section className="section">
        <h2>Compras</h2>
        <ul className="cards">{purchaseNotices.data.map((order) => <li className="card" key={order.id}>
          <Link href={"/minhas-compras?pedido=" + order.id}>{order.status === "denied" ? "Pedido negado pelo estabelecimento" : order.status === "ready" ? "Pedido disponível para retirada" : "Pagamento Pix confirmado"}</Link>
          <p>{order.product_name} · {order.shop_name}</p>
        </li>)}</ul>
      </section> : null}
      {view==="notificacoes" && (notices.length ? <ul className="cards">{notices.slice(0,25).map((item,index)=><li className="card" key={item.photo+item.occurred+index}>
        <Link href={"/cliente?foto="+item.photo}>{item.kind}</Link><p>{item.description}</p></li>)}</ul> : !purchaseNotices?.data?.length && !purchaseNotices?.error && <p>Nenhuma notificação.</p>)}
      {["perfil","perfil-publico"].includes(view) && <h2>Galeria</h2>}
      {!setup && posts.length>0 && <ul className={photo ? "social-post-detail" : "cards social-gallery social-post-grid"}>{posts.slice(0,12).map(post=><li className="card" key={post.id}>
        <ProductGallery name="Fotos da publicação" compact={!photo} items={(photo ? imagesFor(post) : imagesFor(post).slice(0,1)).flatMap((object,index) => {
          const url = links.get(object);
          return url ? [{url, kind:"photo" as const, slot:"photo-"+(index+1)}] : [];
        })} />
        {post.shop ? <Link href={"/cliente?loja="+post.shop}>{post.promotion ? "Promoção do estabelecimento" : "Ver estabelecimento"}</Link> :
          names.has(post.author) && <Link href={"/cliente?perfil="+post.author}>{names.get(post.author)}</Link>}
        <p className="social-post-text">{post.caption}</p>
        {!photo && <Link href={"/cliente?foto="+post.id}>Abrir publicação</Link>}
        {post.author===user.id && <details><summary>Editar ou excluir publicação</summary>
          <PhotoForm path={path} shop={post.shop} photo={post} />
          <form action={deleteSocialPhoto.bind(null,photo ? (post.shop ? "/cliente?loja="+post.shop : "/cliente?aba=perfil") : path,post.id)}><label><input name="confirm" type="checkbox" required /> Confirmar exclusão</label> <button className="secondary">Excluir publicação</button></form>
        </details>}
      </li>)}</ul>}
      {photo && posts.length>0 && <>
        <p>{likes?.count ?? 0} curtidas</p>
        <form action={changeLike.bind(null,path,photo,!!liked?.data)}><button className="secondary">{liked?.data ? "Remover curtida" : "Curtir foto"}</button></form>
        <details className="card panel-form"><summary>Quem curtiu</summary>
          {likerNames.size ? <ul>{likerIds.filter(id=>likerNames.has(id)).map(id=><li key={id}>
            <Link href={"/cliente?perfil="+id}>{likerNames.get(id)}</Link>
          </li>)}</ul> : <p>Nenhuma curtida visível nesta página.</p>}
        </details>
        <h2>Comentários</h2>
        <CommentForm path={path} photo={photo} parent={null} />
        {comments?.data?.slice(0,25).map(comment=><article className="card panel-form" key={comment.id}>
          <p>{comment.parent && "Resposta · "}{comment.body}</p><Link href={"/cliente?perfil="+comment.actor}>Ver perfil de quem comentou</Link>
          {!comment.parent && <details><summary>Responder</summary><CommentForm path={path} photo={photo} parent={comment.id} /></details>}
        </article>)}
      </>}
      {!setup && (more || page>0) && <nav className="account-links" aria-label="Paginação">{page>0 && <Link href={url(page-1)}>Anterior</Link>}{more && <Link href={url(page+1)}>Próxima</Link>}</nav>}
    </section>
  </div>;
}

function CommentForm({path,photo,parent}:{path:string;photo:string;parent:string|null}) {
  return <form className="account-form panel-form" action={commentPhoto.bind(null,path,photo,parent)}><label>{parent ? "Resposta" : "Comentário"} <textarea name="body" maxLength={500} required /></label><button className="secondary">Publicar</button></form>;
}
