import { cookies } from "next/headers";
import { isUuid } from "../../../lib/establishments";
import Link from "next/link";
import { supabaseServer } from "../../../lib/supabase";
import { notFound } from "next/navigation";
import { publicProfile } from "../../../lib/public-booking";
import { ProfilePresence } from "../../cliente/profile-presence";
import { ProfileView } from "./profile-view";

export default async function Establishment({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ denuncia?: string; vitrine?: string; produtos?: string; agendamento?: string }>;
}) {
  const { slug } = await params;
  const profile = await publicProfile(slug);
  if (!profile) notFound();
  const { denuncia, vitrine, produtos, agendamento } = await searchParams;
  const supabase = await supabaseServer();
  const requestToken = (await cookies()).get("barberflow-guest-" + slug)?.value;
  const confirmation = agendamento === "registrado" && requestToken && isUuid(requestToken)
    ? await supabase?.rpc("barberflow_guest_confirmation", { request_id: requestToken }) : null;
  const booking = confirmation?.data?.slug === slug ? confirmation.data : null;
  const claims = await supabase?.auth.getClaims();
  const social = claims?.data?.claims.sub ? await supabase?.rpc("barberflow_social_shop_by_slug",{ shop_slug:slug }) : null;
  const presence = social?.data ? await supabase?.rpc("barberflow_profile_presence", { profile: null, shop_id: social.data }) : null;
  return <>
    {booking && <div className="container" id="agendamento-confirmado">
      <section className="card panel-form" aria-labelledby="booking-confirmed-title">
        <h2 id="booking-confirmed-title">{booking.state === "scheduled" ? "Agendamento confirmado" : booking.state === "pending" ? "Agendamento enviado para aprovação" : "Situação do agendamento"}</h2>
        <p role="status" data-feedback={booking.state === "scheduled" ? "success" : "info"}>
          {booking.state === "scheduled" ? "Seu horário está reservado!" : booking.state === "pending" ? "Sua solicitação foi recebida e aguarda aprovação." : "Consulte o estabelecimento sobre a situação atual."}
          {" "}{booking.service} com {booking.professional}, em {String(booking.start).slice(0,10).split("-").reverse().join("/")} às {String(booking.start).slice(11,16)}.
        </p>
        <p>O estabelecimento recebeu a notificação do agendamento.</p>
      </section>
    </div>}
    <ProfileView profile={profile} denuncia={denuncia} vitrine={vitrine} produtos={produtos} />
    {social?.data && <div className="container section">{presence?.data && <ProfilePresence initial={presence.data} profile={null} shop={social.data} />}<Link className="secondary" href={"/cliente?loja="+social.data}>Seguir, ver publicações e avaliar</Link></div>}</>;

}
