import Link from "next/link";
import { notFound } from "next/navigation";
import { bookingCurrency, publicProfile } from "../../../lib/public-booking";
import { businessDays, httpsUrl, readBusinessProfile, socialUrl } from "../../../lib/business-profile";
import { supabaseServer } from "../../../lib/supabase";
import { ShareProfile, ProfileGallery } from "./profile-controls";
import { saoPauloToday } from "../../../lib/agenda";
import { SubmitButton } from "../../auth/submit";
import { reportReview } from "./review-actions";

export default async function Establishment({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ denuncia?: string }>;
}) {
  const { slug } = await params;
  const profile = await publicProfile(slug);
  if (!profile) notFound();
  const supabase = await supabaseServer();
  const [reviewResult, slotResult] = supabase ? await Promise.all([
    supabase.rpc("barberflow_public_reviews", { profile_slug: slug }),
    supabase.rpc("barberflow_profile_next_slots", { profile_slug: slug }),
  ]) : [];
  const { denuncia } = await searchParams;
  const reviews = (reviewResult?.data ?? []) as { id: string; rating: number; comment: string; author: string; created_at: string }[];
  const slots = new Map(((slotResult?.data ?? []) as { professional_id: string; slot: string }[])
    .map(({ professional_id, slot }) => [professional_id, slot]));
  const details = readBusinessProfile(profile.details);
  const color = details.color && /^#[0-9a-f]{6}$/i.test(details.color) ? details.color : undefined;
  const cover = httpsUrl(details.cover);
  const logo = httpsUrl(details.logo);
  const address = [details.address, details.number, details.complement, details.neighborhood, profile.city, details.region, details.postalCode].filter(Boolean).join(", ");
  const map = httpsUrl(details.map) ?? (details.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : undefined);
  const phone = details.whatsapp?.replace(/\D/g, "") ?? "";
  const whatsapp = /^(55)?\d{10,11}$/.test(phone) ? `https://wa.me/${phone.length <= 11 ? "55" + phone : phone}` : undefined;
  const instagram = details.instagram && /^@?[\w.]{1,30}$/.test(details.instagram)
    ? `https://www.instagram.com/${details.instagram.replace(/^@/, "")}/` : undefined;
  const gallery = (details.gallery ?? []).map(httpsUrl).filter((url): url is string => !!url);
  const video = httpsUrl(details.video);
  const socials = [
    ["Facebook", socialUrl(details.facebook, ["facebook.com", "fb.com"])],
    ["TikTok", socialUrl(details.tiktok, ["tiktok.com"])],
    ["YouTube", socialUrl(details.youtube, ["youtube.com", "youtu.be"])],
  ];
  const professionals = [...new Map(profile.services.flatMap((service) => service.professionals).map((person) => [person.id, person])).values()];
  const bookingPath = `/estabelecimento/${slug}/agendar`;
  const today = saoPauloToday();
  const weekday = new Date(today + "T12:00:00Z").getUTCDay();
  const now = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const todayHours = details.hours?.[weekday];
  const open = todayHours && now >= todayHours.start && now < todayHours.end
    && (!todayHours.breakStart || now < todayHours.breakStart || now >= todayHours.breakEnd);
  return <section className="container section">
    <Link href="/estabelecimentos">Ver estabelecimentos</Link>
    <header className="card panel-form public-business-profile" style={{ borderBlockStartColor: color }}>
      {cover && <img className="landing-card-photo" src={cover} alt={`Capa de ${profile.name}`} />}
      {logo && <img className="business-logo" src={logo} alt={`Logotipo de ${profile.name}`} />}
      <p className="eyebrow">{profile.city}</p>
      <h1>{profile.name}</h1>
      {!!Object.keys(details.hours ?? {}).length && <p><strong>{open ? "Aberto agora" : "Fechado agora"}</strong></p>}
      {profile.description && <p className="intro">{profile.description}</p>}
      {details.address && <p>{address}</p>}
      <div className="account-links">
        <Link className="primary" href={bookingPath}>Agendar horário</Link>
        {map && <a className="secondary" href={map} target="_blank" rel="noopener noreferrer">Como chegar</a>}
        {whatsapp && <a className="secondary" href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        {instagram && <a className="secondary" href={instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
        {socials.map(([label, url]) => url && <a key={label} className="secondary" href={url} target="_blank" rel="noopener noreferrer">{label}</a>)}
        <ShareProfile title={profile.name} />
      </div>
    </header>
    {!!Object.keys(details.hours ?? {}).length && <section className="card panel-form">
      <h2>Horário de funcionamento</h2>
      <dl className="order-totals business-hours">
        {businessDays.map((label, day) => {
          const hours = details.hours?.[day];
          return <div key={label}><dt>{label}</dt><dd>{hours ? <>
            {hours.start}–{hours.end}{hours.breakStart && <small>Intervalo {hours.breakStart}–{hours.breakEnd}</small>}
          </> : "Fechado"}</dd></div>;
        })}
      </dl>
    </section>}
    {video && <section className="card panel-form">
      <h2>Vídeo do estabelecimento</h2>
      <video className="product-media-preview" src={video} controls playsInline preload="metadata" />
    </section>}
    {!!gallery.length && <section className="panel-form">
      <h2>Fotos do local</h2>
      <ProfileGallery images={gallery} title={profile.name} />
    </section>}
    {!!professionals.length && <section>
      <h2>Profissionais</h2>
      <ul className="cards">{professionals.map((person) => {
        const photo = httpsUrl(person.photo_url);
        const slot = slots.get(person.id);
        const services = profile.services.filter((service) => service.professionals.some(({ id }) => id === person.id));
        return <li className="card" key={person.id}>
          {photo && <img className="business-logo" src={photo} alt={`Foto de ${person.name}`} loading="lazy" />}
          <h3>{person.name}</h3>
          {slot && <p>Próximo horário: {slot.slice(0, 10).split("-").reverse().join("/")} às {slot.slice(11, 16)}</p>}
          <p>{services.map(({ name }) => name).join(" · ")}</p>
          <Link className="secondary" href={bookingPath + "?profissional=" + person.id}>Agendar com {person.name}</Link>
        </li>;
      })}</ul>
    </section>}
    <h2>Serviços</h2>
    {profile.services.length ? <ul className="cards">{profile.services.map((service) => <li key={service.id} className="card">
      <h3>{service.name}</h3>
      {service.category && <p className="eyebrow">{service.category}</p>}
      <p>{bookingCurrency.format(service.price_cents / 100)} · {service.duration_minutes} min</p>
      {service.description && <p>{service.description}</p>}
      {service.professionals.length ? <Link className="primary" href={`/estabelecimento/${slug}/agendar?servico=${service.id}`}>Ver horários</Link> : <p>Sem profissionais disponíveis para este serviço.</p>}
    </li>)}</ul> : <p>Nenhum serviço publicado.</p>}
    <section className="card panel-form" id="avaliacoes">
      <h2>Avaliações</h2>
      {denuncia === "enviada" && <p role="status">Denúncia enviada para moderação.</p>}
      {denuncia === "erro" && <p role="alert">Não foi possível enviar a denúncia. Confira se a avaliação ainda está visível e se você já a denunciou.</p>}
      {reviewResult?.error ? <p>As avaliações estão indisponíveis no momento.</p>
        : reviews.length ? <ul className="cards">{reviews.map((review) => <li key={review.id} className="card">
          <strong>{review.author} · {review.rating}/5</strong>
          {review.comment && <p>{review.comment}</p>}
          <details><summary>Denunciar avaliação</summary>
            <form className="account-form" action={reportReview.bind(null, slug, review.id)}>
              <label>Motivo <textarea name="reason" maxLength={500} rows={2} required /></label>
              <SubmitButton>Enviar denúncia</SubmitButton>
            </form>
          </details>
        </li>)}</ul> : <p>Ainda não há avaliações.</p>}
      <p>Clientes com atendimento concluído podem avaliar em Minhas reservas.</p>
    </section>
    {details.address && <section className="card panel-form">
      <h2>Localização</h2><p>{address}</p>
      <div className="account-links">
        {map && <a className="secondary" href={map} target="_blank" rel="noopener noreferrer">Google Maps</a>}
        <a className="secondary" href={`https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`}
          target="_blank" rel="noopener noreferrer">Waze</a>
      </div>
    </section>}
  </section>;
}
