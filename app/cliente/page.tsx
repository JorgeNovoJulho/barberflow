import { PurchaseUpdates } from "../minhas-compras/purchase-updates";
import { BusinessHeader } from "../estabelecimento/[slug]/business-header";
import { publicProfile } from "../../lib/public-booking";
import { masterDate } from "../gestao-master/master-ui";
import { FeedIcon } from "./feed-icon";
import { offsetDay } from "../../lib/agenda";
import { subscriptionPlanLabel, type SubscriptionStatus } from "../../lib/subscriptions";
import { orderProductPhotos } from "../../lib/order-photos";
import { formatShowcaseDate } from "../../lib/showcase";
import { OrderCardHeading } from "../minhas-compras/order-card-heading";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "../../lib/establishments";
import { httpsUrl, socialUrl, whatsappUrl } from "../../lib/business-profile";
import { signOut } from "../auth/actions";
import { blockSocialProfile, changeFavorite, changeFollow, changeLike, commentPhoto, deleteSocialPhoto, freezeSocial, requestDeletion, reviewSocialShop } from "./actions";
import { SocialProfileForm } from "./profile-form";
import { ProfilePresence } from "./profile-presence";
import { ProductGallery } from "../painel/[establishmentId]/estoque/product-gallery";
import { SocialIcon } from "./social-icon";
import { PhotoForm } from "./photo-form";
import { mediaLinks, pageIndex, socialSession, socials } from "./social";

type Photo = { id:string; author:string; shop:string|null; object_path:string; extra_photos?:string[]; caption:string; audience:string; promotion:boolean };
type DirectoryProfile = { id: string; kind: "person" | "shop"; name: string; image: string | null;
  account_type: string; followers: number; following: number; online: boolean; last_seen: string | null };
type Person = { user_id: string; username: string; avatar: string };
type Shop = { id: string; slug: string; name: string; city: string; logo: string | null };
const collectionLabels = {
  seguindo: "Seguindo", seguidores: "Seguidores", "lojas-seguidas": "Estabelecimentos seguidos",
  favoritos: "Estabelecimentos favoritos", bloqueados: "Usuários bloqueados",
};


function SocialCollectionCard({ name, href, image, detail, followers, children }: {
  name: string; href?: string; image?: string; detail?: string; followers?: number; children?: ReactNode;
}) {
  return <li className="card social-collection-card">
    <div className="social-collection-identity">
      <span className="social-collection-avatar" aria-hidden="true">
        {image ? <img src={image} alt="" width={56} height={56} loading="lazy" /> : name.slice(0,2).toUpperCase()}
      </span>
      <div>
        <strong>{href ? <Link href={href}>{name}</Link> : name}</strong>
        {detail && <p>{detail}</p>}
      </div>
    </div>
    {followers !== undefined && <span className="social-collection-followers">
      {followers.toLocaleString("pt-BR")} {followers === 1 ? "seguidor" : "seguidores"}
    </span>}
    {children}
  </li>;
}

export default async function ClientPage({ searchParams }: {
  searchParams: Promise<{ aba?:string; perfil?:string; loja?:string; foto?:string; pagina?:string; estado?:string; compras?:string; estabelecimento?:string; comentarios?:string; busca?:string }>;
}) {
  const { supabase,user } = await socialSession();
  const params = await searchParams;
  const page = pageIndex(params.pagina);
  const ownedShopId = isUuid(params.estabelecimento ?? "") ? params.estabelecimento! : null;
  const ownedShop = ownedShopId ? await supabase.from("barberflow_establishments").select("id,name,slug,profile_details")
    .eq("id", ownedShopId).eq("owner_id", user.id).maybeSingle() : null;
  const publisher = ownedShop?.data ?? null;
  const ownPlan = publisher ? (await supabase.rpc("barberflow_subscription_status", { shop: publisher.id })).data as SubscriptionStatus | null : null;
  const expiry = ownPlan?.ends_before ? offsetDay(ownPlan.ends_before, -1).split("-").reverse().join("/") : null;
  function feedLink(href: string) {
    if (!publisher || !href.startsWith("/cliente")) return href;
    const [pathname, query] = href.split("?");
    const next = new URLSearchParams(query);
    next.set("estabelecimento", publisher.id);
    return pathname + "?" + next;
  }
  const target = params.perfil && isUuid(params.perfil) ? params.perfil : null;
  const shop = params.loja && isUuid(params.loja) ? params.loja : null;
  const photo = params.foto && isUuid(params.foto) ? params.foto : null;
  const collection = params.aba && Object.hasOwn(collectionLabels, params.aba) ? params.aba as keyof typeof collectionLabels : null;
  const view = collection ?? (photo ? "foto" : shop ? "loja" : target ? "perfil-publico" : ["perfil","notificacoes","pessoas"].includes(params.aba ?? "") ? params.aba! : "feed");
  const cancellations = view === "notificacoes" ? await supabase.rpc("barberflow_my_cancellation_notices") : null;
  const deniedPurchases = params.compras === "negados";
  const search = typeof params.busca === "string" ? params.busca.trim().slice(0,120) : "";
  const query = new URLSearchParams();
  if (view === "pessoas" && search) query.set("busca",search);
  if (publisher) query.set("estabelecimento", publisher.id);
  if (params.compras) query.set("compras", deniedPurchases ? "negados" : "confirmados");
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
  const [profileResult, postsResult, countsResult, followingResult, shopResult, servicesResult, directoryResult, noticesResult, deletionResult, generalResult, roleResult, connections, savedShops, presenceResult, blockedProfiles, summaryResult, shopFavorite, purchaseNotices, ownProfile] = await Promise.all([
    profileTable.select("username,avatar,banner,links,theme,frozen,revision").eq("user_id",profileId).maybeSingle(),
    view === "feed" ? supabase.rpc("barberflow_social_feed",{ page_number:page })
      : view === "foto" ? photos.select("*").eq("id",photo!)
      : publisher && view === "perfil" ? photos.select("*").eq("shop",publisher.id).order("created_at",{ ascending:false }).order("id").range(page*12,page*12+12)
      : ["loja","perfil","perfil-publico"].includes(view) ? (shop ? photos.select("*").eq("shop",shop) : photos.select("*").eq("author",profileId).is("shop",null))
        .order("created_at",{ ascending:false }).order("id").range(page*12,page*12+12) : null,
    view === "loja" ? supabase.rpc("barberflow_social_counts",{ profile:shop ? null : profileId,shop_id:shop }) : null,
    shop || (target && target!==user.id) ? followTable.select(shop ? "shop" : "target").eq("follower",user.id).eq(shop ? "shop" : "target",shop ?? target!).maybeSingle() : null,
    shop ? supabase.rpc("barberflow_social_shop_info",{ shop_id:shop }) : null,
    view === "perfil" ? supabase.rpc("barberflow_my_service_counts") : null,
    view === "pessoas" ? supabase.rpc("barberflow_feed_search", { search_text: search, page_number: page }) : null,
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
      .select("id,establishment_id,product_id,order_number,product_sku,shop_name,product_name,status,created_at,total_cents").eq("buyer_id",user.id)
      .in("status",deniedPurchases ? ["denied"] : ["paid","ready","collected"]).order("notice_at",{ascending:false}).limit(20) : null,
    profileId !== user.id ? profileTable.select("username,avatar").eq("user_id",user.id).maybeSingle() : null,
  ]);
  const profile = profileResult.data;
  const account = profileId === user.id ? profile : ownProfile?.data;
  const username = account?.username?.trim();
  const fullName = typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const accountName = fullName || username || "Minha conta";
  const shopInfo = shopResult?.data as { name:string; slug:string; can_review:boolean } | null;
  if ((target && !profile && !profileResult.error) || (shop && !shopInfo && !shopResult?.error) || (photo && !postsResult?.data?.length && !postsResult?.error)) notFound();
  const posts = (postsResult?.data ?? []) as Photo[];
  const [publicBusiness, engagement, shopAuthors] = await Promise.all([
    shopInfo?.slug ? publicProfile(shopInfo.slug).catch(() => null) : null,
    !photo && posts.length ? supabase.rpc("barberflow_feed_engagement", { post_ids: posts.slice(0, 12).map(({ id }) => id) }) : null,
    posts.some((post) => post.shop) ? supabase.rpc("barberflow_feed_shop_names", { post_ids: posts.slice(0, 12).map(({ id }) => id) }) : null,
  ]);
  const shopNames = new Map<string, string>((shopAuthors?.data ?? []).map(({ id, name }: { id: string; name: string }) => [id, name]));
  const reactions = (engagement?.data ?? {}) as Record<string, {
    liked: boolean; likes: number; comments: number;
    people: { id: string; name: string; avatar?: string }[]; messages: { id: string; name: string; body: string; avatar?: string }[];
  }>;
  const setup = !publisher && view === "feed" && roleResult?.data === "cliente" && !profileResult.error && !(profile?.username && profile.avatar);
  const people: Person[] = connections?.data?.rows ?? [];
  const directory = (directoryResult?.data ?? []) as DirectoryProfile[];
  const ownFeedCounts = publisher && view === "perfil"
    ? (await supabase.rpc("barberflow_own_feed_counts", { shop_id: publisher.id })).data : null;
  const shops: Shop[] = savedShops?.data ?? [];
  const blocked = (blockedProfiles?.data ?? []) as Pick<Person,"user_id"|"username">[];
  const notices = (noticesResult?.data ?? []) as { kind:string; photo:string; occurred:string; description:string }[];
  const imagesFor = (post: Photo) => [post.object_path, ...(post.extra_photos ?? [])].filter(Boolean);
  const summary = summaryResult?.data;
  const joined = summary?.joined && new Intl.DateTimeFormat("pt-BR", { month:"long", year:"numeric", timeZone:"America/Sao_Paulo" }).format(new Date(summary.joined));
  const reactionAvatars = Object.values(reactions).flatMap(({ people, messages }) =>
    [...people, ...messages].flatMap(({ avatar }) => avatar ? [avatar] : []));
  const [links, likes, comments, authors, likerRows, cardCounts, purchasePhotos] = await Promise.all([
    mediaLinks(supabase,[...reactionAvatars,account?.avatar ?? "",profile?.avatar ?? "",profile?.banner ?? "",...posts.slice(0,12).flatMap(p=>photo ? imagesFor(p) : imagesFor(p).slice(0,1)),...people.slice(0,12).map((p)=>p.avatar), ...directory.slice(0,12).flatMap((item) => item.kind === "person" && item.image ? [item.image] : [])]),
    photo ? supabase.from("barberflow_social_likes").select("actor",{ count:"exact",head:true }).eq("photo",photo) : null,
    photo ? supabase.from("barberflow_social_comments").select("id,actor,parent,body").eq("photo",photo).order("created_at",{ascending:false}).order("id").range(page*25,page*25+25) : null,
    posts.length ? supabase.from("barberflow_social_profiles").select("user_id,username").in("user_id",[...new Set(posts.map(p=>p.author))]) : null,
    photo ? supabase.from("barberflow_social_likes").select("actor").eq("photo",photo).order("created_at",{ascending:false}).order("actor").range(page*25,page*25+25) : null,
    people.length || shops.length ? supabase.rpc("barberflow_social_card_counts", {
      profiles: people.slice(0,12).map(({ user_id }) => user_id),
      shops: shops.slice(0,12).map(({ id }) => id),
    }) : null,
    orderProductPhotos(supabase, purchaseNotices?.data ?? []),
  ]);
  const followers = new Map<string, number>((cardCounts?.data ?? []).map((row: { is_shop: boolean; id: string; followers: number }) =>
    [`${row.is_shop ? "shop" : "person"}:${row.id}`, row.followers]));
  const likerIds = (likerRows?.data ?? []).slice(0,25).map(row=>row.actor);
  const likerProfiles = likerIds.length ? await profileTable.select("user_id,username").in("user_id",likerIds).eq("frozen",false) : null;
  const likerNames = new Map((likerProfiles?.data ?? []).map(row=>[row.user_id,row.username]));
  const liked = photo ? await supabase.from("barberflow_social_likes").select("photo").eq("photo",photo).eq("actor",user.id).maybeSingle() : null;
  const names = new Map((authors?.data ?? []).map((a)=>[a.user_id,a.username]));
  const more = Math.max(directory.length,posts.length,people.length,shops.length,blocked.length)>12 || notices.length>25 || (comments?.data?.length ?? 0)>25 || (likerRows?.data?.length ?? 0)>25;
  const failed = [profileResult,postsResult,shopResult,servicesResult,directoryResult,noticesResult,purchaseNotices,comments,generalResult,roleResult,connections,savedShops,presenceResult,blockedProfiles,summaryResult,likerRows,likerProfiles].some(result=>result?.error);
  const businessDetails = publisher?.profile_details;
  const identityName = publisher?.name ?? accountName;
  const identityImage = httpsUrl(businessDetails?.logo) ?? links.get(account?.avatar ?? "");
  const identityUsername = publisher?.slug || username;
  const businessProfile = publisher && view === "perfil";
  const title = businessProfile ? publisher.name : setup ? "Primeiros passos" : collection ? collectionLabels[collection] : shopInfo?.name ?? (view==="perfil-publico" ? profile?.username : ({ perfil:"Meu perfil", pessoas:"Encontrar pessoas", notificacoes:"Notificações", foto:"Publicação", feed:"Meu feed" })[view as "feed"]) ?? "Área do cliente";
  return <div className="container workspace social-workspace">
    <PurchaseUpdates interval={5000} />
    <aside className="workspace-rail client-rail">
      <Link className="client-rail-profile" href={feedLink("/cliente?aba=perfil")}>
        <span className="client-rail-avatar" aria-hidden="true">
          {identityImage ? <img src={identityImage} alt="" width={48} height={48} /> : identityName.slice(0, 2).toUpperCase()}
        </span>
        <span className="client-rail-identity">
          <strong>{identityName}</strong>
          {ownPlan?.plan && <small className="client-rail-plan" data-tier={ownPlan.plan}>
            {ownPlan.plan === "premium" && "♛ "}{subscriptionPlanLabel(ownPlan.plan)}
            {expiry && <span> · Vencimento {expiry}</span>}
          </small>}
        </span>
      </Link>
      <nav className="workspace-modules client-rail-nav" aria-label={publisher ? "Feed do estabelecimento" : "Área do cliente"}>
        <div className="client-rail-group">
          <Link href={feedLink("/cliente")} aria-current={view === "feed" ? "page" : undefined}><FeedIcon name="feed" />Feed</Link>
          {publisher && <Link href={`/painel/${publisher.id}/resumo`}><FeedIcon name="dashboard" />Visão geral</Link>}
          <Link href={feedLink("/cliente?aba=perfil")} aria-current={view === "perfil" ? "page" : undefined}><FeedIcon name="person" />Meu perfil</Link>
          <Link href={feedLink("/cliente?aba=notificacoes")} aria-current={view === "notificacoes" ? "page" : undefined}><FeedIcon name="bell" />Notificações</Link>
        </div>
        <div className="client-rail-group">
          <Link href={feedLink("/cliente?aba=pessoas")} aria-current={view === "pessoas" ? "page" : undefined}><FeedIcon name="search" />Encontrar pessoas</Link>
          <Link href={publisher ? "/estabelecimentos?estabelecimento=" + publisher.id : "/estabelecimentos"}><FeedIcon name="shop" />Encontrar estabelecimentos</Link>
          <Link href={feedLink("/cliente?aba=lojas-seguidas")} aria-current={view === "lojas-seguidas" ? "page" : undefined}><FeedIcon name="following" />Estabelecimentos seguidos</Link>
          <Link href={feedLink("/cliente?aba=favoritos")} aria-current={view === "favoritos" ? "page" : undefined}><FeedIcon name="star" />Estabelecimentos favoritos</Link>
        </div>
        <div className="client-rail-group">
          <Link href="/meus-agendamentos"><FeedIcon name="calendar" />Minhas reservas</Link>
          <Link href="/minhas-compras"><FeedIcon name="bag" />Minhas compras</Link>
        </div>
      </nav>
      <form className="client-rail-exit" action={signOut}><button className="workspace-notices"><FeedIcon name="exit" />Sair do sistema</button></form>
    </aside>
    <section className="workspace-content section" data-social-theme={profile?.theme}>
      {publicBusiness ? <div className="public-profile"><BusinessHeader name={publicBusiness.name} city={publicBusiness.city}
        details={publicBusiness.details} /></div> : <h1>{title}</h1>}
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
      {businessProfile && <section className="card social-profile profile-feature">
        {httpsUrl(businessDetails?.cover) && <img className="social-banner" src={httpsUrl(businessDetails?.cover)} alt="Banner do estabelecimento" />}
        {identityImage && <img className="social-avatar" src={identityImage} alt="" />}
        {identityUsername && <p>@{identityUsername}</p>}
        <div className="account-links finance-tabs feed-profile-actions">{[
          ["Instagram", businessDetails?.instagram && /^@?[\w.]{1,30}$/.test(businessDetails.instagram) ? "https://www.instagram.com/" + businessDetails.instagram.replace(/^@/, "") : undefined],
          ["Facebook", socialUrl(businessDetails?.facebook, ["facebook.com", "fb.com"])],
          ["TikTok", socialUrl(businessDetails?.tiktok, ["tiktok.com"])],
          ["YouTube", socialUrl(businessDetails?.youtube, ["youtube.com", "youtu.be"])],
          ["WhatsApp", whatsappUrl(businessDetails?.whatsapp)],
        ].map(([label, link], index) => link && <a key={label} className="secondary finance-tab" data-tone={["rose","blue","purple","amber","green"][index]}
          href={link} target="_blank" rel="noopener noreferrer">{label}</a>)}
          <Link className="secondary finance-tab" data-tone="purple" href={publisher.slug ? feedLink("/cliente?loja=" + publisher.id) : feedLink("/cliente?aba=perfil")}>{ownFeedCounts?.followers ?? "—"} seguidores</Link>
          <Link className="secondary finance-tab" data-tone="blue" href={feedLink("/cliente?aba=seguindo")}>{ownFeedCounts?.following ?? "—"} seguindo</Link>
          <Link className="secondary finance-tab" data-tone="amber" href={feedLink("/cliente?aba=lojas-seguidas")}>Estabelecimentos seguidos</Link>
          {publisher.slug && <Link className="secondary finance-tab" data-tone="green" href={`/estabelecimento/${publisher.slug}#feed`}>Abrir página pública</Link>}
          <Link className="secondary finance-tab" data-tone="rose" href={`/painel/${publisher.id}/publicacao`}>Editar perfil</Link>
        </div>
      </section>}
      {view==="feed" && !setup && <>
        {!publisher && !profile && <p><Link href="/cliente?aba=perfil">Crie seu perfil para publicar e interagir.</Link></p>}
        <form className="account-form card panel-form" action="/estabelecimentos">{publisher && <input type="hidden" name="estabelecimento" value={publisher.id} />}<label>Busque estabelecimentos por nome, cidade ou serviço <input name="busca" maxLength={120} required /></label><button className="primary">Buscar</button></form>
        {generalResult?.data?.length ? <section><h2>Novidades do TOP BARBER</h2>{generalResult.data.map((item)=><article key={item.id} className="card"><h3>{item.title}</h3><p>{item.body}</p></article>)}</section> : null}
        {publisher && <p><Link href={`/painel/${publisher.id}/resumo`}>Voltar ao painel de {publisher.name}</Link></p>}
        {publisher ? <PhotoForm path={path} shop={publisher.id} />
          : profile && !profile.frozen && <PhotoForm path={path} shop={null} />}
        <h2>Publicações</h2>{!posts.length && <p>Nenhuma publicação disponível no momento.</p>}
      </>}
      {!businessProfile && ["perfil","perfil-publico"].includes(view) && <>
        {profile && <div className="card social-profile profile-feature">
          {links.get(profile.banner) && <img className="social-banner" src={links.get(profile.banner)} alt="Banner do perfil" />}
          {links.get(profile.avatar) && <img className="social-avatar" src={links.get(profile.avatar)} alt="" />}
          <div className="profile-feature-body"><h2>{profile.username}</h2>
          {joined && <p className="profile-member">No TOP BARBER desde {joined}</p>}
          {presenceResult?.data && <ProfilePresence key={profileId} initial={presenceResult.data} profile={profileId} shop={null} />}
          <div className="account-links finance-tabs feed-profile-actions">
            <Link className="secondary finance-tab" data-tone="purple" href={feedLink(`/cliente?aba=seguidores&perfil=${profileId}`)}><strong>{summary?.followers ?? "—"}</strong> Seguidores</Link>
            <Link className="secondary finance-tab" data-tone="blue" href={feedLink(`/cliente?aba=seguindo&perfil=${profileId}`)}><strong>{summary?.following ?? "—"}</strong> Seguindo</Link>
          {view === "perfil" && <Link className="secondary finance-tab" data-tone="amber" href="#editar-perfil">Editar perfil</Link>}
          {Object.entries(socials).map(([label,hosts])=> {
            const link = socialUrl(profile.links?.[label],hosts);
            return link && <Link key={label} className="secondary finance-tab" data-tone="green" href={link} rel="noreferrer"><SocialIcon name={label} />{label}</Link>;
          })}
          {target && target!==user.id && <form action={changeFollow.bind(null,path,target,false,!!followingResult?.data)}><button className="secondary finance-tab" data-tone="amber">{followingResult?.data ? "Deixar de seguir" : "Seguir"}</button></form>}
          {target && target!==user.id && <form action={blockSocialProfile.bind(null,target,true)}><button className="secondary finance-tab" data-tone="rose">Bloquear usuário</button></form>}
          </div>

          </div>
        </div>}
        {view==="perfil" && <>
          <div id="editar-perfil"><SocialProfileForm key={profile?.revision ?? "new"} profile={profile ?? undefined}
            avatar={links.get(profile?.avatar ?? "")} banner={links.get(profile?.banner ?? "")} setup={false} /></div>
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
        <div className="account-links finance-tabs">
          <Link className="secondary finance-tab" data-tone="blue" href={"/estabelecimento/" + shopInfo.slug}>Visitar estabelecimento</Link>
          <Link className="secondary finance-tab" data-tone="green" href={"/estabelecimento/" + shopInfo.slug + "/agendar"}>Agendar</Link>
          <form action={changeFollow.bind(null,path,shop,true,!!followingResult?.data)}>
            <button className="secondary finance-tab" data-tone="purple">{followingResult?.data ? "Deixar de seguir" : "Seguir"}</button>
          </form>
          <form action={changeFavorite.bind(null,path,shop,!!shopFavorite?.data)}>
            <button className="secondary finance-tab" data-tone="amber">{shopFavorite?.data ? "Remover favorito" : "Favoritar"}</button>
          </form>
        </div>
        {shopInfo.can_review && <form className="account-form panel-form" action={reviewSocialShop.bind(null,shop)}>
          <label>Avaliação <select name="stars" defaultValue="5">{[0,1,2,3,4,5].map(star=><option key={star} value={star}>{star} estrelas</option>)}</select></label>
          <label>Comentário <textarea name="message" maxLength={500} /></label><button className="secondary">Enviar avaliação</button>
        </form>}
      </div>}
      {connections?.data && <p>{connections.data.count} {collection === "seguidores" ? "seguidores" : "perfis seguidos"}</p>}
      {view === "pessoas" && <>
        <form className="agenda-date feed-directory-search" action="/cliente">
          <input type="hidden" name="aba" value="pessoas" />
          {publisher && <input type="hidden" name="estabelecimento" value={publisher.id} />}
          <label>Nome de usuário ou estabelecimento <input name="busca" type="search" maxLength={120} defaultValue={search} /></label>
          <button className="primary">Buscar</button>
        </form>
        {directory.length ? <ul className="cards social-collection-grid">{directory.slice(0,12).map((item) => {
          const image = item.kind === "shop" ? httpsUrl(item.image ?? undefined) : links.get(item.image ?? "");
          return <li className="card social-collection-card feed-directory-card" key={item.kind + item.id}>
            <Link href={feedLink("/cliente?" + (item.kind === "shop" ? "loja=" : "perfil=") + item.id)}>
              <div className="social-collection-identity">
                <span className="social-collection-avatar" aria-hidden="true">{image ? <img src={image} alt="" width={56} height={56} loading="lazy" /> : item.name.slice(0,2).toUpperCase()}</span>
                <div><strong>{item.name}</strong><p>{item.account_type}</p></div>
              </div>
              <p className="feed-directory-totals"><span>{item.followers} seguidores</span><span>{item.following} seguindo</span></p>
              <p>{item.online && <>Online agora · </>}{item.last_seen ? <>Último acesso <time dateTime={item.last_seen}>{masterDate(item.last_seen)}</time></> : "Sem registro de acesso"}</p>
            </Link>
          </li>;
        })}</ul> : !directoryResult?.error && <p>Nenhum perfil encontrado.</p>}
      </>}
      {connections?.data && (people.length ? <ul className="cards social-collection-grid">
        {people.slice(0,12).map((person) => <SocialCollectionCard key={person.user_id} name={person.username}
          href={feedLink("/cliente?perfil=" + person.user_id)} image={links.get(person.avatar)} followers={followers.get("person:" + person.user_id)}>
          {collection === "seguindo" && profileId === user.id && <form action={changeFollow.bind(null,path,person.user_id,false,true)}>
            <button className="secondary">Deixar de seguir</button>
          </form>}
        </SocialCollectionCard>)}
      </ul> : <p>Nenhum perfil disponível.</p>)}
      {(collection === "lojas-seguidas" || collection === "favoritos" || ((view === "perfil" || collection === "seguindo") && profileId === user.id)) && <>
        {collection !== "lojas-seguidas" && collection !== "favoritos" && <h2>Estabelecimentos seguidos</h2>}
        {shops.length ? <ul className="cards social-collection-grid">
          {shops.slice(0,12).map((item) => <SocialCollectionCard key={item.id} name={item.name}
            href={feedLink("/cliente?loja=" + item.id)} image={httpsUrl(item.logo ?? undefined)} detail={item.city} followers={followers.get("shop:" + item.id)}>
            <form action={collection === "favoritos" ? changeFavorite.bind(null,path,item.id,true) : changeFollow.bind(null,path,item.id,true,true)}>
              <button className="secondary">{collection === "favoritos" ? "Remover favorito" : "Deixar de seguir"}</button>
            </form>
          </SocialCollectionCard>)}
        </ul> : <p>Nenhum estabelecimento nesta lista.</p>}
      </>}
      {collection === "bloqueados" && (blocked.length ? <ul className="cards social-collection-grid">
        {blocked.slice(0,12).map((person) => <SocialCollectionCard key={person.user_id} name={person.username}>
          <form action={blockSocialProfile.bind(null,person.user_id,false)}><button className="secondary">Desbloquear usuário</button></form>
        </SocialCollectionCard>)}
      </ul> : <p>Nenhum usuário bloqueado.</p>)}
      {view === "notificacoes" && page === 0 && !!cancellations?.data?.length && <section className="section">
        <h2>Agendamentos cancelados</h2>
        <ul className="cards">{cancellations.data.map((item: { id:string; shop_name:string; service_name:string; starts_at:string; reason:string }) => <li className="card" key={item.id}>
          <strong>{item.service_name} · {item.shop_name}</strong>
          <p>{item.starts_at.slice(0,10).split("-").reverse().join("/")} às {item.starts_at.slice(11,16)}</p>
          <p data-feedback="warning">Motivo do cancelamento: {item.reason}</p>
          <Link href={"/meus-agendamentos#" + item.id}>Ver agendamento</Link>
        </li>)}</ul>
      </section>}
      {view === "notificacoes" && page === 0 && <section className="section">
        <h2>Compras</h2>
        <nav className="account-links finance-tabs" aria-label="Situação dos produtos">
          <Link className="secondary finance-tab" data-tone="rose" aria-current={deniedPurchases ? "page" : undefined} href={feedLink("/cliente?aba=notificacoes&compras=negados")}>Produtos Negados</Link>
          <Link className="secondary finance-tab" data-tone="green" aria-current={!deniedPurchases ? "page" : undefined} href={feedLink("/cliente?aba=notificacoes&compras=confirmados")}>Produtos Confirmados</Link>
        </nav>
        {purchaseNotices?.error ? <p role="alert">Não foi possível carregar os avisos de compra.</p>
          : purchaseNotices?.data?.length ? <ul className="cards order-card-grid">
            {purchaseNotices.data.map((order) => <li className="card showcase-order purchase-notice-card" data-order-status={order.status} key={order.id}>
              <OrderCardHeading order={order} label={order.shop_name} photo={purchasePhotos.get(order.establishment_id + "/" + order.product_id)}
                alert={order.status === "denied"} status={order.status === "denied" ? "Pedido negado" : order.status === "collected" ? "Retirado" : order.status === "ready" ? "Disponível para retirada" : "Pagamento confirmado"} />
              <div className="order-card-body">
                <p><small>Data da compra · {formatShowcaseDate(order.created_at)}</small></p>
                <Link className="secondary" href={"/minhas-compras?pedido=" + order.id}>Ver pedido</Link>
              </div>
            </li>)}
          </ul> : <p>{deniedPurchases ? "Nenhum produto negado." : "Nenhum produto confirmado."}</p>}
      </section>}
      {view==="notificacoes" && (notices.length ? <ul className="cards">{notices.slice(0,25).map((item,index)=><li className="card" key={item.photo+item.occurred+index}>
        <Link href={feedLink("/cliente?foto="+item.photo)}>{item.kind}</Link><p>{item.description}</p></li>)}</ul> : <p>Nenhuma notificação social.</p>)}
      {["perfil","perfil-publico"].includes(view) && !businessProfile && <h2>Galeria</h2>}
      {!setup && posts.length>0 && <ul className={photo ? "social-post-detail" : "cards social-gallery social-post-grid"}>{posts.slice(0,12).map(post=><li className="card" id={"post-" + post.id} key={post.id}>
        <ProductGallery name="Fotos da publicação" post={post.id} compact={!photo} items={(photo ? imagesFor(post) : imagesFor(post).slice(0,1)).flatMap((object,index) => {
          const url = links.get(object);
          return url ? [{url, kind:"photo" as const, slot:"photo-"+(index+1)}] : [];
        })} />
        {post.shop ? <Link href={feedLink("/cliente?loja="+post.shop)}>{shopNames.get(post.shop) ?? names.get(post.author) ?? "Estabelecimento"}</Link> :
          names.has(post.author) && <Link href={feedLink("/cliente?perfil="+post.author)}>{names.get(post.author)}</Link>}
        <p className="social-post-text">{post.caption}</p>
        {!photo && <>
          <div className="account-links feed-reactions">
            <form action={changeLike.bind(null, path + "#post-" + post.id, post.id, !!reactions[post.id]?.liked)}>
              <button className="secondary feed-like-button" aria-pressed={!!reactions[post.id]?.liked}>{reactions[post.id]?.liked ? "♥ Curtido" : "♡ Curtir"}</button>
            </form>
            <Link href={feedLink("/cliente?foto="+post.id)}>Abrir publicação</Link>
          </div>
          <details><summary>Quem curtiu{reactions[post.id] ? ` · ${reactions[post.id].likes}` : ""}</summary>
            {reactions[post.id]?.people.length ? <ul>{reactions[post.id].people.map((person) =>
              <li key={person.id}><ReactionIdentity name={person.name} image={links.get(person.avatar ?? "")} /></li>)}</ul> : <p>Nenhuma curtida visível.</p>}
            {(reactions[post.id]?.likes ?? 0) > 5 && <Link href={feedLink("/cliente?foto="+post.id)}>Ver todas as curtidas</Link>}
          </details>
          <details open={params.comentarios === post.id}>
            <summary>Comentar e ver comentários{reactions[post.id] ? ` · ${reactions[post.id].comments}` : ""}</summary>
            {reactions[post.id]?.messages.map((comment) => <div className="feed-comment-preview" key={comment.id}><ReactionIdentity name={comment.name} image={links.get(comment.avatar ?? "")} /><p>{comment.body}</p></div>)}
            {(reactions[post.id]?.comments ?? 0) > 5 && <Link href={feedLink("/cliente?foto="+post.id)}>Ver todos os comentários</Link>}
            <CommentForm path={path + "&comentarios=" + post.id + "#post-" + post.id} photo={post.id} parent={null} />
          </details>
        </>}
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
            <Link href={feedLink("/cliente?perfil="+id)}>{likerNames.get(id)}</Link>
          </li>)}</ul> : <p>Nenhuma curtida visível nesta página.</p>}
        </details>
        <h2>Comentários</h2>
        <CommentForm path={path} photo={photo} parent={null} />
        {comments?.data?.slice(0,25).map(comment=><article className="card panel-form" key={comment.id}>
          <p>{comment.parent && "Resposta · "}{comment.body}</p><Link href={feedLink("/cliente?perfil="+comment.actor)}>Ver perfil de quem comentou</Link>
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

function ReactionIdentity({ name, image }: { name: string; image?: string }) {
  return <span className="feed-reaction-identity">
    {image ? <img src={image} width={28} height={28} loading="lazy" alt="" /> : <span aria-hidden="true">{name.slice(0,2).toUpperCase()}</span>}
    <strong>{name}</strong>
  </span>;
}
