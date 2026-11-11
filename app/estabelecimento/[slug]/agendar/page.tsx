import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { offsetDay, saoPauloToday, validDay } from "../../../../lib/agenda";
import { publicProfile } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { BookingForm } from "./booking-form";
import { bookOnline } from "./actions";

const feedback: Record<string, string> = {
  invalido: "Selecione um horário e confira os dados de contato.",
  indisponivel: "Esse horário ficou indisponível. Escolha outro.",
  falha: "Não foi possível confirmar a reserva. Tente novamente.",
};

export default async function Booking({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ servico?: string; profissional?: string; dia?: string; estado?: string }>;
}) {
  const { slug } = await params;
  const profile = await publicProfile(slug);
  if (!profile) notFound();
  const { servico, profissional, dia, estado } = await searchParams;
  const service = profile.services.find((entry) => entry.id === servico);
  const person = service?.professionals.find((entry) => entry.id === profissional);
  const today = saoPauloToday();
  const supabase = await supabaseServer();
  const requestToken = (await cookies()).get("barberflow-guest-" + slug)?.value;
  const confirmation = estado === "registrado" && requestToken
    ? await supabase?.rpc("barberflow_guest_confirmation", { request_id: requestToken }) : null;
  if (confirmation?.data?.slug === slug) return <section className="container section">
    <h1>{confirmation.data.state === "scheduled" ? "Agendamento confirmado" : confirmation.data.state === "pending" ? "Agendamento enviado para aprovação" : "Situação do agendamento"}</h1>
    <p role="status" data-feedback="success">{confirmation.data.service} com {confirmation.data.professional} em {confirmation.data.shop}.</p>
    <p>{String(confirmation.data.start).slice(0,10).split("-").reverse().join("/")} às {String(confirmation.data.start).slice(11,16)}</p>
    <p>{confirmation.data.state === "scheduled" ? "Seu horário está reservado. O estabelecimento recebeu a notificação." : "O estabelecimento recebeu sua solicitação. Entre em contato para acompanhar a confirmação."}</p>
    <Link className="secondary" href={"/estabelecimento/" + slug}>Voltar à página do estabelecimento</Link>
  </section>;
  const availability = await supabase?.rpc("barberflow_booking_enabled", { profile_slug: slug });
  if (availability?.error || availability?.data === false) return <section className="container section">
    <Link href={"/estabelecimento/" + slug}>Voltar para {profile.name}</Link>
    <h1>Agendar atendimento</h1>
    <p role="status">Os agendamentos online deste estabelecimento estão indisponíveis no momento.</p>
  </section>;
  const horizon = supabase && await supabase.rpc("barberflow_booking_limit", { profile_slug: slug });
  const limit = offsetDay(today, typeof horizon?.data === "number" ? horizon.data : 30);
  const day = typeof dia === "string" && validDay(dia) && dia >= today && dia <= limit ? dia : today;
  const user = supabase && (await supabase.auth.getUser()).data.user;
  const result = supabase && service && person ? await supabase.rpc("barberflow_public_slots", {
    profile_slug: slug, professional: person.id, service: service.id, booking_day: day,
  }) : null;
  const slots = (result?.data ?? []) as { slot: string }[];
  return <section className="container section public-booking booking-redesign">
    <Link href={`/estabelecimento/${slug}`}>Voltar para {profile.name}</Link>
    <header className="public-intro">
      <p className="eyebrow">{profile.name}</p>
      <h1>Agende seu horário</h1>
    </header>
    {estado && Object.hasOwn(feedback, estado) && <p role="status" data-feedback="error">{feedback[estado]}</p>}
    <BookingForm key={JSON.stringify([servico, profissional, dia, estado])}
      slug={slug} services={profile.services.filter((entry) => entry.professionals.length)}
      initialService={service?.id ?? ""} initialPerson={person?.id ?? (!service ? profissional ?? "" : "")}
      day={day} today={today} limit={limit} initialSlots={result && !result.error ? slots : null}
      initialName={typeof user?.user_metadata.full_name === "string" ? user.user_metadata.full_name : ""}
      requestId={randomUUID()} action={bookOnline.bind(null, slug)} />
  </section>;
}
