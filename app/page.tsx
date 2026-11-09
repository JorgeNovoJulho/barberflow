import type { CSSProperties } from "react";
import Link from "next/link";
import { segments as catalogSegments } from "../lib/establishments";
import { parseLandingSettings, validImageUrl, type LandingBlock, type Section } from "../lib/landing";
import { supabaseServer } from "../lib/supabase";

function BlockImage({ block, hero = false }: { block: LandingBlock; hero?: boolean }) {
  if (!block.image_url || !validImageUrl(block.image_url)) return null;
  return <img className={hero ? "landing-hero-photo" : "landing-card-photo"} src={block.image_url}
    alt={block.image_alt} loading={hero ? "eager" : "lazy"} decoding="async" />;
}

export default async function Home() {
  const supabase = await supabaseServer();
  const [result, settingsResult, session] = supabase ? await Promise.all([
    supabase.from("barberflow_landing_blocks")
      .select("id,section,title,body,image_url,image_alt,position,published")
      .eq("published", true).order("position").order("id"),
    supabase.from("barberflow_landing_settings").select("appearance").maybeSingle(),
    supabase.auth.getClaims(),
  ]) : [];
  const settings = parseLandingSettings(settingsResult?.data?.appearance);
  const signedIn = !!session?.data?.claims.sub;
  const blocks = (result?.data ?? []) as LandingBlock[];
  const group = (section: Section) => blocks.filter((block) => block.section === section);
  const heroes = group("hero");
  const segments = group("segmentos");
  const features = group("funcionalidades");
  const retail = group("estoque");
  const questions = group("duvidas");
  const navigation = [
    ["#segmentos", settings.navSegments, segments.length],
    ["#funcionalidades", settings.navFeatures, features.length],
    ["#estoque", settings.navStock, retail.length],
    ["#duvidas", settings.navFaq, questions.length],
  ] as const;
  const style = {
    "--landing-gold": settings.accent, "--landing-overlay": Number(settings.overlay) / 100,
    "--landing-focus": settings.photoFocus === "right" ? "72%" : settings.photoFocus === "left" ? "25%" : "50%",
  } as CSSProperties;
  const brand = <>{settings.logoUrl ? <img src={settings.logoUrl} alt="" width={32} height={32} />
    : <span aria-hidden="true">✦</span>}{settings.brand || "BARBERFLOW"}</>;

  return <div className="landing editorial-landing" style={style} data-motion={settings.motion ? "on" : "off"}>
    <header className="editorial-top">
      <div className="container editorial-nav">
        <Link href="/" className="editorial-brand">{brand}</Link>
        <nav aria-label="Seções da página">{navigation.map(([url, title, count]) => !!count && title && <a key={url} href={url}>{title}</a>)}</nav>
        {signedIn ? <Link href="/painel" className="secondary">Meu painel</Link>
          : settings.headerUrl && settings.headerText && <Link href={settings.headerUrl} className="secondary">{settings.headerText}</Link>}
      </div>
    </header>
    {(!heroes.length || result?.error) && <section className="container section">
      <h1>{settings.brand || "BARBERFLOW"}</h1><p>{settings.kicker}</p>
    </section>}
    {heroes.map((block, index) => <section className="hero landing-hero" key={block.id}>
      <BlockImage block={block} hero />
      <div className="container landing-hero-copy">
        {settings.kicker && <p className="eyebrow">{settings.kicker}</p>}
        {index === 0 ? <h1>{block.title}</h1> : <h2>{block.title}</h2>}
        {block.body && <p className="intro">{block.body}</p>}
        <div className="hero-actions">
          {settings.primaryText && settings.primaryUrl && <Link className="primary" href={settings.primaryUrl}>{settings.primaryText} <span aria-hidden="true">↗</span></Link>}
          {settings.secondaryText && settings.secondaryUrl && <Link className="secondary" href={settings.secondaryUrl}>{settings.secondaryText}</Link>}
        </div>
      </div>
    </section>)}
    {settings.discovery && <section className="container editorial-search" aria-labelledby="editorial-search-title">
      <div className="editorial-search-heading">
        <span aria-hidden="true">⌖</span>
        <div><h2 id="editorial-search-title">{settings.discoveryTitle || "Buscar estabelecimentos"}</h2><p>{settings.discoveryText}</p></div>
      </div>
      <form className="account-form editorial-search-form" action="/estabelecimentos">
        <label>Cidade ou estabelecimento <input name="busca" maxLength={120} placeholder="Ex.: São Paulo" /></label>
        <label>Segmento <select name="segmento"><option value="">Todos os segmentos</option>
          {Object.entries(catalogSegments).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <button type="submit" className="primary">{settings.discoveryButton || "Buscar"} <span aria-hidden="true">↗</span></button>
      </form>
    </section>}
    {features.length > 0 && <section className="container section editorial-features" id="funcionalidades">
      <h2>{settings.featuresTitle}</h2>
      <ul className="cards">
        {features.map((block, index) => <li key={block.id} className="card">
          <BlockImage block={block} /><span className="landing-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <h3>{block.title}</h3>{block.body && <p>{block.body}</p>}
        </li>)}
      </ul>
    </section>}
    {segments.length > 0 && <section className="editorial-segments" id="segmentos">
      <div className="container section"><h2>{settings.segmentsTitle}</h2>
        <ul className="specialties">{segments.map((block, index) => <li key={block.id}>
          <BlockImage block={block} />
          <span className="landing-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <h3>{block.title}</h3>{block.body && <p>{block.body}</p>}
        </li>)}</ul>
      </div>
    </section>}
    {retail.length > 0 && <section className="container section" id="estoque">
      {retail.map((block) => <article key={block.id} className="retail-showcase">
        <div><p className="eyebrow">{settings.stockTitle}</p><h2>{block.title}</h2><p>{block.body}</p></div>
        <BlockImage block={block} />
      </article>)}
    </section>}
    {questions.length > 0 && <section id="duvidas" className="container section">
      <h2>{settings.faqTitle}</h2>
      {questions.map((block) => <details key={block.id}>
        <summary>{block.title}</summary><p>{block.body}</p><BlockImage block={block} />
      </details>)}
    </section>}
    <footer className="editorial-footer">
      <div className="container">
        <div><Link href="/" className="editorial-brand">{brand}</Link><p>{settings.footerText}</p></div>
        <nav aria-label="Rodapé da página">
          {navigation.map(([url, title, count]) => !!count && title && <a key={url} href={url}>{title}</a>)}
          {settings.contactText && settings.contactUrl && <Link href={settings.contactUrl}>{settings.contactText}</Link>}
          {signedIn && <><Link href="/meus-agendamentos">Minhas reservas</Link>
            <Link href="/minhas-compras">Minhas compras</Link><Link href="/configuracoes">Configurações</Link></>}
        </nav>
      </div>
    </footer>
  </div>;
}
