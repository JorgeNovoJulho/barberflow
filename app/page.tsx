import { BrandLogo } from "./brand-logo";
import type { CSSProperties } from "react";
import Link from "next/link";
import { segments as catalogSegments } from "../lib/establishments";
import { parseLandingSettings, validImageUrl, type LandingBlock, type Section } from "../lib/landing";
import { hasMasterSession, masterPath } from "../lib/master";
import { signOut } from "./auth/actions";
import { supabaseServer } from "../lib/supabase";

const highlights = [
  { icon: "↗", title: "Agendamento sem conta", text: "Compartilhe um link para o cliente reservar um horário sem precisar se cadastrar." },
  { icon: "◷", title: "Agenda por profissional", text: "Organize a equipe por dia, semana ou mês e acompanhe os próximos atendimentos." },
  { icon: "◇", title: "Vitrine com Pix", text: "Publique produtos e acompanhe os pedidos, da confirmação do pagamento à retirada." },
  { icon: "≡", title: "Serviços e produtos na mesma comanda", text: "Some os itens em uma cobrança e consulte o histórico no fechamento." },
];

const workflows = [
  { title: "Atendimento e equipe", items: ["Horários por profissional e bloqueios na agenda", "Remarcações, cancelamentos e horários liberados na agenda", "Avisos sonoros de notificações e lembretes de atendimento"] },
  { title: "Estoque e vendas", items: ["Cadastro com fotos, vídeo, código interno e código de barras", "Preço de venda calculado a partir do custo e da margem", "Alertas de estoque mínimo e promoções para itens próximos da validade"] },
  { title: "Financeiro e comissões", items: ["Contas a pagar e a receber, com despesas por categoria", "Relatórios de movimento e fechamento por período", "Comissões sobre serviços e produtos com recibo de quitação"] },
  { title: "Presença online", items: ["Página pública com serviços, equipe, localização e WhatsApp", "Editor de capas e personalização da identidade do estabelecimento", "Vitrine, avaliações e publicações para manter clientes informados"] },
];

const screenshots = [
  { file: "painel", title: "Visão geral", alt: "Atalhos para agendamentos, comandas e fechamento no painel do TOP BARBER" },
  { file: "agenda", title: "Agenda", alt: "Agenda com visões por dia, semana e mês e guia de cancelados" },
  { file: "vitrine", title: "Vitrine", alt: "Produtos publicados na vitrine do estabelecimento com fotos e preços" },
];

function BlockImage({ block, hero = false }: { block: LandingBlock; hero?: boolean }) {
  if (!block.image_url || !validImageUrl(block.image_url)) return null;
  return <img className={hero ? "landing-hero-photo" : "landing-card-photo"} src={block.image_url}
    alt={block.image_alt} loading={hero ? "eager" : "lazy"} decoding="async" />;
}

export default async function Home() {
  const supabase = await supabaseServer();
  const [result, settingsResult, session, master] = supabase ? await Promise.all([
    supabase.from("barberflow_landing_blocks")
      .select("id,section,title,body,image_url,image_alt,position,published")
      .eq("published", true).order("position").order("id"),
    supabase.from("barberflow_landing_settings").select("appearance").maybeSingle(),
    supabase.auth.getClaims(),
    hasMasterSession(),
  ]) : [];
  const settings = parseLandingSettings(settingsResult?.data?.appearance);
  const signedIn = !!session?.data?.claims.sub;
  const role = signedIn && supabase ? (await supabase.rpc("barberflow_account_kind")).data : null;
  const blocks = (result?.data ?? []) as LandingBlock[];
  const group = (section: Section) => blocks.filter((block) => block.section === section);
  const heroes = group("hero");
  const segments = group("segmentos");
  const features = group("funcionalidades");
  const retail = group("estoque");
  const questions = group("duvidas");
  const navigation = [
    ["#funcionalidades", settings.navFeatures, 1],
    ["#segmentos", settings.navSegments, segments.length],
    ["#estoque", settings.navStock, retail.length],
    ["#duvidas", settings.navFaq, questions.length],
    ["#demonstracao", "Demonstração", 1],
  ] as const;
  const style = {
    "--landing-accent": settings.accent, "--landing-overlay": Number(settings.overlay) / 100,
    "--landing-focus": settings.photoFocus === "right" ? "72%" : settings.photoFocus === "left" ? "25%" : "50%",
  } as CSSProperties;
  const brand = settings.logoUrl
    ? <><img src={settings.logoUrl} alt="" width={32} height={32} />{settings.brand}</>
    : <BrandLogo />;

  return <div className="landing editorial-landing" style={style} data-motion={settings.motion ? "on" : "off"}>
    <header className="editorial-top">
      <div className="container editorial-nav">
        <Link href="/" className="editorial-brand">{brand}</Link>
        <nav aria-label="Seções da página">{navigation.map(([url, title, count]) => !!count && title && <a key={url} href={url}>{title}</a>)}<Link href="/sobre">Sobre</Link></nav>
        {master && <Link href={masterPath} className="secondary master-header-link">Administrador</Link>}
        {signedIn ? <><Link href={role === "cliente" ? "/cliente" : "/painel"} className="secondary">Meu painel</Link><form action={signOut}><button className="secondary">Sair do sistema</button></form></>
          : settings.headerUrl && settings.headerText && <Link href={settings.headerUrl} className="secondary">{settings.headerText}</Link>}
      </div>
    </header>
    {(!heroes.length || result?.error) && <section className="container section">
      <h1>{settings.brand || "TOP BARBER"}</h1><p>{settings.kicker}</p>
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
    <section className="landing-highlights" aria-label="Diferenciais do TOP BARBER">
      <ul className="container">{highlights.map(({ icon, title, text }) => <li key={title}>
        <span className="landing-highlight-icon" aria-hidden="true">{icon}</span>
        <div><h2>{title}</h2><p>{text}</p></div>
      </li>)}</ul>
    </section>
    {settings.discovery && <section className="container editorial-search" aria-labelledby="editorial-search-title">
      <div className="editorial-search-heading">
        <span aria-hidden="true">⌖</span>
        <div><h2 id="editorial-search-title">{settings.discoveryTitle || "Buscar estabelecimentos"}</h2><p>{settings.discoveryText}</p>
          <ol className="discovery-steps"><li>Digite sua cidade.</li><li>Clique em Buscar estabelecimentos.</li><li>Abra o estabelecimento escolhido e clique em Agendar horário.</li></ol></div>
      </div>
      <form className="account-form editorial-search-form" action="/estabelecimentos">
        <label>Informe sua cidade <input name="busca" maxLength={120} placeholder="Ex.: Votorantim" required /></label>
        <label>Segmento <select name="segmento"><option value="">Todos os segmentos</option>
          {Object.entries(catalogSegments).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <button type="submit" className="primary">{settings.discoveryButton || "Buscar"} <span aria-hidden="true">↗</span></button>
      </form>
    </section>}
    <section className="landing-light" id="funcionalidades">
      <div className="container section">
        <h2>{settings.featuresTitle || "Da reserva ao fechamento do dia"}</h2>
        <p className="landing-section-intro">Organize a rotina da equipe, venda produtos e acompanhe as finanças no mesmo painel.</p>
        <div className="landing-workflows">{workflows.map(({ title, items }) => <article key={title}>
          <h3>{title}</h3>
          <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
        </article>)}</div>
        {features.length > 0 && <ul className="cards editorial-features" aria-label="Mais funcionalidades">
          {features.map((block) => <li key={block.id} className="card">
            <BlockImage block={block} />
            <h3>{block.title}</h3>{block.body && <p>{block.body}</p>}
          </li>)}
        </ul>}
      </div>
    </section>
    {segments.length > 0 && <section className="editorial-segments" id="segmentos">
      <div className="container section"><h2>{settings.segmentsTitle}</h2>
        <ul className="specialties">{segments.map((block) => <li key={block.id}>
          <BlockImage block={block} />
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
    <section id="demonstracao" className="container section landing-demo" aria-labelledby="demo-title">
      <h2 id="demo-title">Veja o TOP BARBER em ação</h2>
      <div className="landing-screens">
        {screenshots.map(({ file, title, alt }) => <figure key={file}>
          <img src={`/media/top-barber-${file}.webp`} alt={alt} loading="lazy" decoding="async" />
          <figcaption>{title}</figcaption>
        </figure>)}
      </div>
      <div className="landing-video">
        <div>
          <h3>Conheça o painel em 1 minuto e 28 segundos</h3>
          <p>Veja como a agenda, as comandas e a vitrine se encaixam na rotina do estabelecimento.</p>
          {settings.primaryText && settings.primaryUrl && <Link className="primary" href={settings.primaryUrl}>{settings.primaryText}</Link>}
        </div>
        <video controls playsInline preload="none" poster="/media/top-barber-painel.webp" aria-label="Apresentação do TOP BARBER">
          <source src="/media/top-barber-apresentacao.mp4" type="video/mp4" />
          <track kind="captions" src="/media/top-barber-apresentacao.vtt" srcLang="pt-BR" label="Português" />
          <a href="/media/top-barber-apresentacao.mp4">Abrir vídeo de apresentação</a>
        </video>
      </div>
    </section>
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
