import { isStudioCover } from "../../../lib/cover-studio";
import type { CSSProperties } from "react";
import { serviceMediaUrls } from "../../../lib/service-media";
import { ServiceMedia } from "../../service-media";
import Link from "next/link";
import { Showcase } from "./showcase";
import { bookingCurrency, type PublicProfile } from "../../../lib/public-booking";
import { businessDays, httpsUrl, publicProfileColor, readBusinessProfile, socialUrl, whatsappUrl } from "../../../lib/business-profile";
import { supabaseServer } from "../../../lib/supabase";
import { ShareProfile, ProfileGallery } from "./profile-controls";
import { saoPauloToday } from "../../../lib/agenda";
import { SubmitButton } from "../../auth/submit";
import { reportReview } from "./review-actions";

export async function ProfileView({ profile, previewShop, denuncia, vitrine, produtos }: {
  profile: PublicProfile; previewShop?: string; denuncia?: string; vitrine?: string; produtos?: string;
}) {
  const { slug } = profile;
  const supabase = await supabaseServer();
  const [reviewResult, slotResult] = supabase && !previewShop ? await Promise.all([
    supabase.rpc("barberflow_public_reviews", { profile_slug: slug }),
    supabase.rpc("barberflow_profile_next_slots", { profile_slug: slug }),
  ]) : [];

  const reviews = (reviewResult?.data ?? []) as { id: string; rating: number; comment: string; author: string; created_at: string }[];
  const slots = new Map(((slotResult?.data ?? []) as { professional_id: string; slot: string }[])
    .map(({ professional_id, slot }) => [professional_id, slot]));
  const mediaUrls = await serviceMediaUrls(profile.services);
  const details = readBusinessProfile(profile.details);
  const color = publicProfileColor(details.color);
  const cover = httpsUrl(details.cover);
  const studioCover = isStudioCover(cover);
  const logo = httpsUrl(details.logo);
  const address = [details.address, details.number, details.complement, details.neighborhood, profile.city, details.region, details.postalCode].filter(Boolean).join(", ");
  const map = httpsUrl(details.map) ?? (details.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : undefined);
  const whatsapp = whatsappUrl(details.whatsapp);
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
  return <section className="container section public-profile">
    {previewShop ? <div className="card panel-form">
      <Link href={'/painel/' + previewShop + '/publicacao'}>Voltar à Página pública</Link>
      <p>Prévia da última versão salva. Agendamentos e compras ficam desativados aqui.</p>
    </div> : <Link href="/estabelecimentos">Ver estabelecimentos</Link>}
    <header className={`public-business-profile${studioCover ? " has-studio-cover" : cover ? " has-cover" : ""}`} style={{ borderBlockStartColor: color, "--profile-color": color } as CSSProperties}>
      {cover && <img className={studioCover ? "business-studio-cover" : "business-cover"} src={cover} alt="" decoding="async" />}
      <div className="business-heading">
      {logo && <img className="business-logo" src={logo} alt={`Logotipo de ${profile.name}`} />}
      <p className="eyebrow">{profile.city}</p>
      <h1>{profile.name}</h1>
      {!!Object.keys(details.hours ?? {}).length && <p><strong className={`business-status${open ? " is-open" : ""}`}>{open ? "Aberto agora" : "Fechado agora"}</strong></p>}
      {profile.description && <p className="intro">{profile.description}</p>}
      {details.address && <p>{address}</p>}
      <div className="account-links">
        {previewShop ? <button type="button" className="primary" disabled>Agendar horário</button> : <Link className="primary" href={bookingPath}>Agendar horário</Link>}
        {map && <a className="secondary" href={map} target="_blank" rel="noopener noreferrer">Como chegar</a>}
        {whatsapp && <a className="secondary" href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        {instagram && <a className="secondary" href={instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
        {socials.map(([label, url]) => url && <a key={label} className="secondary" href={url} target="_blank" rel="noopener noreferrer">{label}</a>)}
        {!previewShop && <ShareProfile title={profile.name} />}
      </div>
      </div>
    </header>
    <nav className="account-links profile-sections" aria-label="Nesta página">
      <Link className="secondary" href="#servicos">Serviços</Link>
      {!!professionals.length && <Link className="secondary" href="#profissionais">Profissionais</Link>}
      {!!gallery.length && <Link className="secondary" href="#fotos">Fotos</Link>}
      <Link className="secondary" href="#vitrine">Vitrine</Link>
      <Link className="secondary" href="#avaliacoes">Avaliações</Link>
    </nav>
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
    {!!gallery.length && <section className="profile-section" id="fotos">
      <h2>Fotos do local</h2>
      <ProfileGallery images={gallery} title={profile.name} />
    </section>}
    {!!professionals.length && <section className="profile-section" id="profissionais">
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
          {!previewShop && <Link className="secondary" href={bookingPath + "?profissional=" + person.id}>Agendar com {person.name}</Link>}
        </li>;
      })}</ul>
    </section>}
    <section className="profile-section" id="servicos">
    <h2>Serviços</h2>
    {profile.services.length ? <ul className="cards">{profile.services.map((service) => <li key={service.id} className="card">
      <h3>{service.name}</h3>
      <ServiceMedia service={service} urls={mediaUrls} compact />
      {service.category && <p className="eyebrow">{service.category}</p>}
      <p><strong className="public-service-price">{bookingCurrency.format(service.price_cents / 100)}</strong> · {service.duration_minutes} min</p>
      {service.description && <p>{service.description}</p>}
      {previewShop ? null : service.professionals.length ? <Link className="primary" href={`/estabelecimento/${slug}/agendar?servico=${service.id}`}>Ver horários</Link> : <p>Sem profissionais disponíveis para este serviço.</p>}
    </li>)}</ul> : <p>Nenhum serviço publicado.</p>}
    </section>
    <Showcase slug={slug} previewShop={previewShop} status={vitrine} page={produtos} />
    <section className="card panel-form" id="avaliacoes">
      <h2>Avaliações</h2>
      {denuncia === "enviada" && <p role="status">Denúncia enviada para moderação.</p>}
      {denuncia === "erro" && <p role="alert">Não foi possível enviar a denúncia. Confira se a avaliação ainda está visível e se você já a denunciou.</p>}
      {previewShop ? <p>As avaliações ficam disponíveis na página publicada.</p> : reviewResult?.error ? <p>As avaliações estão indisponíveis no momento.</p>
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
