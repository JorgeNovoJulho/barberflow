import Link from "next/link";
import { validImageUrl, type LandingBlock, type Section } from "../lib/landing";
import { supabaseServer } from "../lib/supabase";

function BlockImage({ block, hero = false }: { block: LandingBlock; hero?: boolean }) {
  if (!block.image_url || !validImageUrl(block.image_url)) return null;
  return <img className={hero ? "landing-hero-photo" : "landing-card-photo"} src={block.image_url}
    alt={block.image_alt} loading={hero ? "eager" : "lazy"} decoding="async" />;
}

export default async function Home() {
  const supabase = await supabaseServer();
  const result = supabase && await supabase.from("barberflow_landing_blocks")
    .select("id,section,title,body,image_url,image_alt,position,published")
    .eq("published", true).order("position").order("id");
  const blocks = (result?.data ?? []) as LandingBlock[];
  const group = (section: Section) => blocks.filter((block) => block.section === section);
  const heroes = group("hero");
  const segments = group("segmentos");
  const features = group("funcionalidades");
  const retail = group("estoque");
  const questions = group("duvidas");

  return <div className="landing">
    {result?.error || !result ? <section className="container section">
      <h1>BARBERFLOW</h1><p>Gestão para beleza e bem-estar.</p>
      <Link className="primary" href="/login">Entrar</Link>
    </section> : null}
    {heroes.map((block, index) => <section className="hero landing-hero" key={block.id}>
      <BlockImage block={block} hero />
      <div className="container landing-hero-copy">
        <p className="eyebrow">Gestão para beleza e bem-estar</p>
        {index === 0 ? <h1>{block.title}</h1> : <h2>{block.title}</h2>}
        {block.body && <p className="intro">{block.body}</p>}
        <div className="hero-actions">
          <Link className="primary" href="/cadastro">Criar conta <span aria-hidden="true">↗</span></Link>
          <Link className="secondary" href="/planos">Ver planos</Link>
        </div>
      </div>
    </section>)}
    {segments.length > 0 && <section className="container section" id="segmentos">
      <p className="eyebrow">01 · Segmentos</p>
      <h2>Encontre o seu segmento</h2>
      <ul className="specialties">{segments.map((block, index) => <li key={block.id}>
        <BlockImage block={block} />
        <span className="landing-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <h3>{block.title}</h3>{block.body && <p>{block.body}</p>}
      </li>)}</ul>
    </section>}
    {features.length > 0 && <section className="landing-features" id="funcionalidades">
      <div className="container section">
        <p className="eyebrow">02 · Funcionalidades</p>
        <h2>Da reserva ao fechamento do dia</h2>
        <ul className="cards">
          {features.map((block, index) => <li key={block.id} className="card">
            <span className="landing-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <BlockImage block={block} /><h3>{block.title}</h3><p>{block.body}</p>
          </li>)}
        </ul>
      </div>
    </section>}
    {retail.length > 0 && <section className="container section" id="estoque">
      {retail.map((block) => <article key={block.id} className="retail-showcase">
        <div><p className="eyebrow">03 · Estoque e comanda</p><h2>{block.title}</h2><p>{block.body}</p></div>
        <BlockImage block={block} />
      </article>)}
    </section>}
    {questions.length > 0 && <section id="duvidas" className="container section">
      <p className="eyebrow">04 · Dúvidas</p>
      <h2>Perguntas frequentes</h2>
      {questions.map((block) => <details key={block.id}>
        <summary>{block.title}</summary><p>{block.body}</p><BlockImage block={block} />
      </details>)}
    </section>}
  </div>;
}
