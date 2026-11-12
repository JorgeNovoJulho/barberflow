import { BookingCode } from "./booking-code";
import { cookies } from "next/headers";
import { isUuid } from "../../../lib/establishments";
import Link from "next/link";
import { supabaseServer } from "../../../lib/supabase";
import { notFound } from "next/navigation";
import { publicProfile } from "../../../lib/public-booking";
import { mediaLinks } from "../../cliente/social";
import { ProfilePresence } from "../../cliente/profile-presence";
import { ProfileView } from "./profile-view";

export default async function Establishment({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ denuncia?: string; vitrine?: string; produtos?: string; agendamento?: string; equipe?: string }>;
}) {
  const { slug } = await params;
  const profile = await publicProfile(slug);
  if (!profile) notFound();
  const { denuncia, vitrine, produtos, agendamento, equipe } = await searchParams;
  const supabase = await supabaseServer();
  const requestToken = (await cookies()).get("barberflow-guest-" + slug)?.value;
  const confirmation = agendamento === "registrado" && requestToken && isUuid(requestToken)
    ? await supabase?.rpc("barberflow_guest_confirmation", { request_id: requestToken }) : null;
  const booking = confirmation?.data?.slug === slug ? confirmation.data : null;
  const claims = await supabase?.auth.getClaims();
  const social = claims?.data?.claims.sub ? await supabase?.rpc("barberflow_social_shop_by_slug",{ shop_slug:slug }) : null;
  const feed = await supabase?.rpc("barberflow_public_shop_feed", { shop_slug: slug });
  const posts = (feed?.data ?? []) as { id: string; caption: string; object_path: string; extra_photos: string[]; created_at: string }[];
  const photos = supabase && posts.length ? await mediaLinks(supabase,
    posts.flatMap((post) => [post.object_path, ...post.extra_photos])) : new Map<string, string>();
  const presence = social?.data ? await supabase?.rpc("barberflow_profile_presence", { profile: null, shop_id: social.data }) : null;
  const professional = equipe && isUuid(equipe) && social?.data === equipe && supabase
    ? await supabase.rpc("barberflow_professional_panel", { shop_id: equipe, period: "dia" }) : null;
  return <>
    {booking && <div className="container" id="agendamento-confirmado">
      <section className="card panel-form" aria-labelledby="booking-confirmed-title">
        <h2 id="booking-confirmed-title">{booking.state === "scheduled" ? "Agendamento confirmado" : booking.state === "pending" ? "Agendamento enviado para aprovação" : "Situação do agendamento"}</h2>
        <p role="status" data-feedback={booking.state === "scheduled" ? "success" : "info"}>
          {booking.state === "scheduled" ? "Seu horário está reservado!" : booking.state === "pending" ? "Sua solicitação foi recebida e aguarda aprovação." : "Consulte o estabelecimento sobre a situação atual."}
          {" "}{booking.service} com {booking.professional}, em {String(booking.start).slice(0,10).split("-").reverse().join("/")} às {String(booking.start).slice(11,16)}.
        </p>
        {booking.state === "cancelled" && booking.reason ? <p role="status" data-feedback="warning">Agendamento cancelado pelo estabelecimento. Motivo: {booking.reason}</p> : <p>O estabelecimento recebeu a notificação do agendamento.</p>}
        {requestToken && <><p>Guarde o código para consultar a reserva em outro navegador.</p><BookingCode key={requestToken} code={requestToken} /></>}
        <Link className="secondary" href={`/estabelecimento/${slug}/consultar`}>Consultar meu agendamento</Link>
      </section>
    </div>}
    <ProfileView professionalShop={professional?.data ? equipe : undefined} profile={profile} denuncia={denuncia} vitrine={vitrine} produtos={produtos} />
    {posts.length > 0 && <section className="container section" id="feed">
      <h2>Feed de {profile.name}</h2>
      <ul className="cards social-post-grid">{posts.map((post) => <li className="card" key={post.id}>
        <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</time>
        {post.caption && <p className="social-post-text">{post.caption}</p>}
        <div className="public-feed-photos">{[post.object_path, ...post.extra_photos].flatMap((object, index) => {
          const image = photos.get(object);
          return image ? [<img key={object} src={image} alt={`Foto ${index + 1} da publicação`} loading="lazy" />] : [];
        })}</div>
        {claims?.data?.claims.sub && <Link href={"/cliente?foto=" + post.id}>Abrir publicação</Link>}
      </li>)}</ul>
    </section>}
    {social?.data && <div className="container section">{presence?.data && <ProfilePresence initial={presence.data} profile={null} shop={social.data} />}<Link className="secondary" href={"/cliente?loja="+social.data}>Seguir, ver publicações e avaliar</Link></div>}</>;

}
