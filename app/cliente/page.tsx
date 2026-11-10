import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "../../lib/establishments";
import { socialUrl } from "../../lib/business-profile";
import { signOut } from "../auth/actions";
import { changeFollow, changeLike, commentPhoto, deleteSocialPhoto, freezeSocial, requestDeletion, reviewSocialShop, saveSocialProfile } from "./actions";
import { PhotoForm } from "./photo-form";
import { mediaLinks, pageIndex, socialSession, socials } from "./social";

type Photo = { id:string; author:string; shop:string|null; object_path:string; caption:string; audience:string; promotion:boolean };
const images = "image/jpeg,image/png,image/webp,image/avif";
const themes = { claro:"Claro", rosa:"Rosa", verde:"Verde", azul:"Azul" };

export default async function ClientPage({ searchParams }: {
  searchParams: Promise<{ aba?:string; perfil?:string; loja?:string; foto?:string; pagina?:string; estado?:string }>;
}) {
  const { supabase,user } = await socialSession();
  const params = await searchParams;
  const page = pageIndex(params.pagina);
  const target = params.perfil && isUuid(params.perfil) ? params.perfil : null;
  const shop = params.loja && isUuid(params.loja) ? params.loja : null;
  const photo = params.foto && isUuid(params.foto) ? params.foto : null;
  const view = photo ? "foto" : shop ? "loja" : target ? "perfil-publico" : ["perfil","notificacoes","pessoas"].includes(params.aba ?? "") ? params.aba! : "feed";
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
  const [profileResult, postsResult, countsResult, followingResult, shopResult, servicesResult, directoryResult, noticesResult, deletionResult, generalResult] = await Promise.all([
    profileTable.select("username,avatar,banner,links,theme,frozen").eq("user_id",profileId).maybeSingle(),
    view === "feed" ? supabase.rpc("barberflow_social_feed",{ page_number:page })
      : view === "foto" ? photos.select("*").eq("id",photo!)
      : ["loja","perfil","perfil-publico"].includes(view) ? (shop ? photos.select("*").eq("shop",shop) : photos.select("*").eq("author",profileId).is("shop",null))
        .order("created_at",{ ascending:false }).order("id").range(page*12,page*12+12) : null,
    ["loja","perfil","perfil-publico"].includes(view) ? supabase.rpc("barberflow_social_counts",{ profile:shop ? null : profileId,shop_id:shop }) : null,
    shop || (target && target!==user.id) ? followTable.select(shop ? "shop" : "target").eq("follower",user.id).eq(shop ? "shop" : "target",shop ?? target!).maybeSingle() : null,
    shop ? supabase.rpc("barberflow_social_shop_info",{ shop_id:shop }) : null,
    view === "perfil" ? supabase.rpc("barberflow_my_service_counts") : null,
    view === "pessoas" ? profileTable.select("user_id,username,avatar").neq("user_id",user.id).eq("frozen",false).order("username").order("user_id").range(page*12,page*12+12) : null,
    view === "notificacoes" ? supabase.rpc("barberflow_social_notices",{ page_number:page }) : null,
    view === "perfil" ? supabase.from("barberflow_account_deletion_requests").select("requested_at").eq("user_id",user.id).maybeSingle() : null,
    view === "feed" && page===0 ? supabase.from("barberflow_social_news").select("id,title,body").order("created_at",{ascending:false}).limit(5) : null,
  ]);
  const profile = profileResult.data;
  const shopInfo = shopResult?.data as { name:string; slug:string; can_review:boolean } | null;
  if ((target && !profile && !profileResult.error) || (shop && !shopInfo && !shopResult?.error) || (photo && !postsResult?.data?.length && !postsResult?.error)) notFound();
  const posts = (postsResult?.data ?? []) as Photo[];
  const people = directoryResult?.data ?? [];
  const notices = (noticesResult?.data ?? []) as { kind:string; photo:string; occurred:string; description:string }[];
  const [links, likes, comments, authors] = await Promise.all([
    mediaLinks(supabase,[profile?.avatar ?? "",profile?.banner ?? "",...posts.slice(0,12).map((p)=>p.object_path),...people.slice(0,12).map((p)=>p.avatar)]),
    photo ? supabase.from("barberflow_social_likes").select("actor",{ count:"exact",head:true }).eq("photo",photo) : null,
    photo ? supabase.from("barberflow_social_comments").select("id,actor,parent,body").eq("photo",photo).order("created_at",{ascending:false}).order("id").range(page*25,page*25+25) : null,
    posts.length ? supabase.from("barberflow_social_profiles").select("user_id,username").in("user_id",[...new Set(posts.map(p=>p.author))]) : null,
  ]);
  const liked = photo ? await supabase.from("barberflow_social_likes").select("photo").eq("photo",photo).eq("actor",user.id).maybeSingle() : null;
  const names = new Map((authors?.data ?? []).map((a)=>[a.user_id,a.username]));
  const more = Math.max(posts.length,people.length)>12 || notices.length>25 || (comments?.data?.length ?? 0)>25;
  const failed = [profileResult,postsResult,shopResult,servicesResult,directoryResult,noticesResult,comments,generalResult].some(result=>result?.error);
  const title = shopInfo?.name ?? (view==="perfil-publico" ? profile?.username : ({ perfil:"Meu perfil", pessoas:"Encontrar pessoas", notificacoes:"Notificações", foto:"Publicação", feed:"Meu feed" })[view as "feed"]) ?? "Área do cliente";
  return <div className="container workspace social-workspace">
    <aside className="workspace-rail"><nav className="workspace-modules" aria-label="Área do cliente">
      <Link href="/cliente">Feed</Link><Link href="/cliente?aba=perfil">Meu perfil</Link><Link href="/cliente?aba=pessoas">Encontrar pessoas</Link>
      <Link href="/estabelecimentos">Encontrar estabelecimentos</Link><Link href="/meus-agendamentos">Minhas reservas</Link>
      <Link href="/minhas-compras">Minhas compras</Link><Link href="/cliente?aba=notificacoes">Notificações</Link>
    </nav><form action={signOut}><button className="workspace-notices">Sair do sistema</button></form></aside>
    <section className="workspace-content section" data-social-theme={profile?.theme}>
      <h1>{title}</h1>
      {params.estado && <p role="status">{params.estado==="salvo" ? "Alteração registrada." : "Não foi possível concluir. Confira os dados, a visibilidade e as permissões do perfil."}</p>}
      {failed && <p role="alert">Parte do conteúdo não pôde ser carregada.</p>}
      {view==="feed" && <>
        {!profile && <p><Link href="/cliente?aba=perfil">Crie seu perfil para seguir e interagir com outras pessoas.</Link></p>}
        <form className="account-form card panel-form" action="/estabelecimentos"><label>Busque estabelecimentos por nome, cidade ou serviço <input name="busca" maxLength={120} required /></label><button className="primary">Buscar</button></form>
        {generalResult?.data?.length ? <section><h2>Novidades do BARBERFLOW</h2>{generalResult.data.map((item)=><article key={item.id} className="card"><h3>{item.title}</h3><p>{item.body}</p></article>)}</section> : null}
        <h2>Publicações</h2>{!posts.length && <p>Seu feed está vazio. Siga pessoas e estabelecimentos para ver suas publicações.</p>}
      </>}
      {["perfil","perfil-publico"].includes(view) && <>
        {profile && <div className="card social-profile">
          {links.get(profile.banner) && <img className="social-banner" src={links.get(profile.banner)} alt="Banner do perfil" />}
          {links.get(profile.avatar) && <img className="social-avatar" src={links.get(profile.avatar)} alt="" />}
          <h2>{profile.username}</h2><p>{countsResult?.data?.followers ?? 0} seguidores · {countsResult?.data?.following ?? 0} seguindo</p>
          {Object.entries(socials).map(([label,hosts])=> {
            const link = socialUrl(profile.links?.[label],hosts);
            return link && <Link key={label} href={link} rel="noreferrer">{label} </Link>;
          })}
          {target && target!==user.id && <form action={changeFollow.bind(null,path,target,false,!!followingResult?.data)}><button className="secondary">{followingResult?.data ? "Deixar de seguir" : "Seguir perfil"}</button></form>}
        </div>}
        {view==="perfil" && <>
          <form className="account-form card panel-form" action={saveSocialProfile}>
            <h2>Configurações do perfil</h2>
            <label>Nome de usuário <input name="username" required minLength={3} maxLength={40} pattern="[A-Za-z0-9_.\x2D]{3,40}" defaultValue={profile?.username} /></label>
            <small>Use letras sem acento, números, ponto, hífen ou sublinhado.</small>
            <label>Foto de perfil <input type="file" name="avatar" accept={images} /></label>
            {profile?.avatar && <label><input type="checkbox" name="remove_avatar" /> Remover foto</label>}
            <label>Banner <input type="file" name="banner" accept={images} /></label>
            {profile?.banner && <label><input type="checkbox" name="remove_banner" /> Remover banner</label>}
            <small>Até 2 MB por imagem.</small>
            {Object.keys(socials).map(network=><label key={network}>{network} <input type="url" name={network} maxLength={300} defaultValue={profile?.links?.[network]} /></label>)}
            <label>Tema <select name="theme" defaultValue={profile?.theme ?? "claro"}>{Object.entries(themes).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
            <button className="primary">Salvar perfil</button>
          </form>
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
          {profile && !profile.frozen && <PhotoForm path={path} shop={null} />}
        </>}
        <h2>Galeria</h2>
      </>}
      {shop && shopInfo && <div className="card panel-form">
        <p>{countsResult?.data?.followers ?? 0} seguidores</p>
        <div className="account-links"><Link href={"/estabelecimento/"+shopInfo.slug}>Visitar estabelecimento</Link><Link href={"/estabelecimento/"+shopInfo.slug+"/agendar"}>Agendar</Link></div>
        <form action={changeFollow.bind(null,path,shop,true,!!followingResult?.data)}><button className="secondary">{followingResult?.data ? "Deixar de seguir" : "Seguir estabelecimento"}</button></form>
        {shopInfo.can_review && <form className="account-form panel-form" action={reviewSocialShop.bind(null,shop)}>
          <label>Avaliação <select name="stars" defaultValue="5">{[0,1,2,3,4,5].map(star=><option key={star} value={star}>{star} estrelas</option>)}</select></label>
          <label>Comentário <textarea name="message" maxLength={500} /></label><button className="secondary">Enviar avaliação</button>
        </form>}
      </div>}
      {view==="pessoas" && (people.length ? <ul className="cards">{people.slice(0,12).map(person=><li className="card" key={person.user_id}>
        {links.get(person.avatar) && <img className="social-avatar" src={links.get(person.avatar)} alt="" loading="lazy" />}
        <Link href={"/cliente?perfil="+person.user_id}>{person.username}</Link></li>)}</ul> : <p>Nenhum perfil disponível.</p>)}
      {view==="notificacoes" && (notices.length ? <ul className="cards">{notices.slice(0,25).map((item,index)=><li className="card" key={item.photo+item.occurred+index}>
        <Link href={"/cliente?foto="+item.photo}>{item.kind}</Link><p>{item.description}</p></li>)}</ul> : <p>Nenhuma notificação.</p>)}
      {posts.length>0 && <ul className="cards social-gallery">{posts.slice(0,12).map(post=><li className="card" key={post.id}>
        {links.get(post.object_path) && <Link href={"/cliente?foto="+post.id}><img src={links.get(post.object_path)} alt={post.caption || "Foto da publicação"} loading="lazy" /></Link>}
        {post.shop ? <Link href={"/cliente?loja="+post.shop}>{post.promotion ? "Promoção do estabelecimento" : "Ver estabelecimento"}</Link> :
          names.has(post.author) && <Link href={"/cliente?perfil="+post.author}>{names.get(post.author)}</Link>}
        <p>{post.caption}</p>
        {!photo && <Link href={"/cliente?foto="+post.id}>Abrir publicação</Link>}
        {post.author===user.id && <details><summary>Editar ou remover foto</summary>
          <PhotoForm path={path} shop={post.shop} photo={post} />
          <form action={deleteSocialPhoto.bind(null,photo ? (post.shop ? "/cliente?loja="+post.shop : "/cliente?aba=perfil") : path,post.id)}><label><input name="confirm" type="checkbox" required /> Confirmar remoção</label> <button className="secondary">Remover foto</button></form>
        </details>}
      </li>)}</ul>}
      {photo && posts.length>0 && <>
        <p>{likes?.count ?? 0} curtidas</p>
        <form action={changeLike.bind(null,path,photo,!!liked?.data)}><button className="secondary">{liked?.data ? "Remover curtida" : "Curtir foto"}</button></form>
        <h2>Comentários</h2>
        <CommentForm path={path} photo={photo} parent={null} />
        {comments?.data?.slice(0,25).map(comment=><article className="card panel-form" key={comment.id}>
          <p>{comment.parent && "Resposta · "}{comment.body}</p><Link href={"/cliente?perfil="+comment.actor}>Ver perfil de quem comentou</Link>
          {!comment.parent && <details><summary>Responder</summary><CommentForm path={path} photo={photo} parent={comment.id} /></details>}
        </article>)}
      </>}
      {(more || page>0) && <nav className="account-links" aria-label="Paginação">{page>0 && <Link href={url(page-1)}>Anterior</Link>}{more && <Link href={url(page+1)}>Próxima</Link>}</nav>}
    </section>
  </div>;
}

function CommentForm({path,photo,parent}:{path:string;photo:string;parent:string|null}) {
  return <form className="account-form panel-form" action={commentPhoto.bind(null,path,photo,parent)}><label>{parent ? "Resposta" : "Comentário"} <textarea name="body" maxLength={500} required /></label><button className="secondary">Publicar</button></form>;
}
