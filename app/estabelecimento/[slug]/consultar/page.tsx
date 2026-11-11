import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicProfile } from "../../../../lib/public-booking";
import { saoPauloToday } from "../../../../lib/agenda";
import { GuestForm } from "./guest-form";

export default async function ConsultBooking({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await publicProfile(slug);
  if (!profile) notFound();
  const saved = (await cookies()).has("barberflow-guest-" + slug);
  return <section className="container section">
    <Link href={`/estabelecimento/${slug}`}>Voltar ao estabelecimento</Link>
    <h1>Consultar agendamento</h1>
    <p>{profile.name} · Informe os dados usados para agendar como convidado.</p>
    <GuestForm slug={slug} saved={saved} today={saoPauloToday()} />
  </section>;
}
