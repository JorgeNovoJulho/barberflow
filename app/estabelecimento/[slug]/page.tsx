import Link from "next/link";
import { supabaseServer } from "../../../lib/supabase";
import { notFound } from "next/navigation";
import { publicProfile } from "../../../lib/public-booking";
import { ProfilePresence } from "../../cliente/profile-presence";
import { ProfileView } from "./profile-view";

export default async function Establishment({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ denuncia?: string; vitrine?: string; produtos?: string }>;
}) {
  const { slug } = await params;
  const profile = await publicProfile(slug);
  if (!profile) notFound();
  const { denuncia, vitrine, produtos } = await searchParams;
  const supabase = await supabaseServer();
  const claims = await supabase?.auth.getClaims();
  const social = claims?.data?.claims.sub ? await supabase?.rpc("barberflow_social_shop_by_slug",{ shop_slug:slug }) : null;
  const presence = social?.data ? await supabase?.rpc("barberflow_profile_presence", { profile: null, shop_id: social.data }) : null;
  return <><ProfileView profile={profile} denuncia={denuncia} vitrine={vitrine} produtos={produtos} />
    {social?.data && <div className="container section">{presence?.data && <ProfilePresence initial={presence.data} profile={null} shop={social.data} />}<Link className="secondary" href={"/cliente?loja="+social.data}>Seguir, ver publicações e avaliar</Link></div>}</>;

}
