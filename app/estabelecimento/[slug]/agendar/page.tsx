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
  const path = `/estabelecimento/${slug}/agendar`;
  const next = service && person
    ? path + "?" + new URLSearchParams({ servico: service.id, profissional: person.id, dia: day })
    : path;
  const availableServices = profile.services.filter((entry) => entry.professionals.some((provider) => !profissional || provider.id === profissional));
  const step = !service ? 0 : !person || !slots.length ? 1 : 2;

  return <section className="container section public-booking">
    <Link href={`/estabelecimento/${slug}`}>Voltar para {profile.name}</Link>
    <header className="public-intro">
      <p className="eyebrow">{profile.name}</p>
      <h1>Agendar atendimento</h1>
    </header>
    <ol className="booking-steps" aria-label="Etapas do agendamento">
      {["Serviço", "Profissional e data", "Horário e confirmação"].map((label, index) =>
        <li key={label} aria-current={step === index ? "step" : undefined}><span aria-hidden="true">{index + 1}</span>{label}</li>)}
    </ol>
    {estado && Object.hasOwn(feedback, estado) && <p role="status">{feedback[estado]}</p>}
    <div className={service ? "booking-layout" : undefined}>
    <div>
    {!service ? availableServices.length ? <ul className="cards">
      {availableServices.map((entry) => <li className="card booking-service-card" key={entry.id}>
        <h2>{entry.name}</h2>
        <p><strong className="public-service-price">{bookingCurrency.format(entry.price_cents / 100)}</strong> · {entry.duration_minutes} min</p>
        {entry.description && <p>{entry.description}</p>}
        <Link className="primary" href={path + "?" + new URLSearchParams({ servico: entry.id, ...(profissional ? { profissional } : {}) })}>Escolher serviço</Link>
      </li>)}
    </ul> : <p className="card">Nenhum serviço com profissional disponível para agendamento.</p>
    : <div className="card booking-panel">
      <h2>Profissional e data</h2>
      <form className="account-form" action={path}>
        <input type="hidden" name="servico" value={service.id} />
        <label>Profissional <select name="profissional" required defaultValue={person?.id ?? ""}>
          <option value="" disabled>Selecione</option>
          {service.professionals.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Data <input type="date" name="dia" min={today} max={limit} required defaultValue={day} /></label>
        <button className="primary" type="submit">Buscar horários</button>
      </form>
    </div>}
    {result?.error && <p role="alert">Não foi possível carregar os horários.</p>}
    {result && !result.error && !slots.length && <p className="card booking-panel">Nenhum horário disponível nesta data. Selecione outro dia ou profissional.</p>}
    {service && person && slots.length > 0 && <div className="card booking-panel">
      <h2>Horários disponíveis</h2>
      {!user ? <>
        <ul className="booking-time-list" aria-label="Horários disponíveis">{slots.map(({ slot }) => <li key={slot}>{slot.slice(11, 16)}</li>)}</ul>
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
    </div>
    {service && <aside className="card booking-summary" aria-label="Resumo do agendamento">
      <h2>Seu agendamento</h2>
      <dl className="order-totals">
        <div><dt>Serviço</dt><dd>{service.name}</dd></div>
        <div><dt>Duração</dt><dd>{service.duration_minutes} min</dd></div>
        {person && <div><dt>Profissional</dt><dd>{person.name}</dd></div>}
        <div><dt>Data</dt><dd>{day.split("-").reverse().join("/")}</dd></div>
        <div><dt>Valor</dt><dd className="public-service-price">{bookingCurrency.format(service.price_cents / 100)}</dd></div>
      </dl>
      <Link href={path}>Escolher outro serviço</Link>
    </aside>}
    </div>
  </section>;
}
