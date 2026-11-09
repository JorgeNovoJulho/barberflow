import Link from "next/link";
import { notFound } from "next/navigation";
import { offsetDay, saoPauloToday, validDay } from "../../../../lib/agenda";
import { bookingCurrency, publicProfile } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { bookOnline } from "./actions";

const feedback: Record<string, string> = {
  invalido: "Selecione um horário e confira os dados de contato.",
  indisponivel: "Esse horário ficou indisponível. Escolha outro.",
  falha: "Não foi possível confirmar a reserva. Confira sua conta e tente novamente.",
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
  const horizon = supabase && await supabase.rpc("barberflow_booking_limit", { profile_slug: slug });
  const limit = offsetDay(today, typeof horizon?.data === "number" ? horizon.data : 30);
  const day = typeof dia === "string" && validDay(dia) && dia >= today && dia <= limit ? dia : today;
  const user = supabase && (await supabase.auth.getUser()).data.user;
  const result = supabase && service && person ? await supabase.rpc("barberflow_public_slots", {
    profile_slug: slug, professional: person.id, service: service.id, booking_day: day,
  }) : null;
  const slots = (result?.data ?? []) as { slot: string }[];
  const path = `/estabelecimento/${slug}/agendar`;
  const next = service && person
    ? path + "?" + new URLSearchParams({ servico: service.id, profissional: person.id, dia: day })
    : path;

  return <section className="container section">
    <Link href={`/estabelecimento/${slug}`}>{profile.name}</Link>
    <h1>Agendar atendimento</h1>
    {estado && Object.hasOwn(feedback, estado) && <p role="status">{feedback[estado]}</p>}
    {!service ? <ul className="cards">
      {profile.services.filter((entry) => entry.professionals.some((person) => !profissional || person.id === profissional)).map((entry) => <li className="card" key={entry.id}>
        <h2>{entry.name}</h2>
        <Link href={path + "?" + new URLSearchParams({ servico: entry.id, ...(profissional ? { profissional } : {}) })}>Escolher serviço</Link>
      </li>)}
    </ul> : <div className="card panel-form">
      <h2>{service.name}</h2>
      <p>{bookingCurrency.format(service.price_cents / 100)} · {service.duration_minutes} min</p>
      <form className="account-form" action={path}>
        <input type="hidden" name="servico" value={service.id} />
        <label>Profissional <select name="profissional" required defaultValue={person?.id ?? ""}>
          <option value="" disabled>Selecione</option>
          {service.professionals.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Data <input type="date" name="dia" min={today} max={limit} required defaultValue={day} /></label>
        <button className="secondary" type="submit">Buscar horários</button>
      </form>
    </div>}
    {result?.error && <p role="alert">Não foi possível carregar os horários.</p>}
    {result && !result.error && !slots.length && <p>Nenhum horário disponível nesta data.</p>}
    {service && person && slots.length > 0 && <div className="card panel-form">
      <h2>Horários disponíveis</h2>
      {!user ? <>
        <p>{slots.map(({ slot }) => slot.slice(11, 16)).join(" · ")}</p>
        <Link className="primary" href={"/login?" + new URLSearchParams({ next })}>Entrar para confirmar</Link>
      </> : <form className="account-form" action={bookOnline.bind(null, slug, service.id, person.id, day)}>
        <fieldset className="booking-slots"><legend>Escolha o horário</legend>
          {slots.map(({ slot }) => <label key={slot}>
            <input type="radio" name="slot" value={slot.slice(11, 16)} required /> {slot.slice(11, 16)}
          </label>)}
        </fieldset>
        <label>Nome <input name="customer" required maxLength={120}
          defaultValue={typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : ""} /></label>
        <label>WhatsApp <input name="phone" type="tel" maxLength={30} /></label>
        <SubmitButton>Confirmar agendamento</SubmitButton>
      </form>}
    </div>}
  </section>;
}
