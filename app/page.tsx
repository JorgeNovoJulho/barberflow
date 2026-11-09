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

  return <>
    {result?.error || !result ? <section className="container section">
      <h1>BARBERFLOW</h1><p>Gestão para beleza e bem-estar.</p>
      <Link className="primary" href="/login">Entrar</Link>
    </section> : null}
    {heroes.map((block, index) => <section className="hero landing-hero" key={block.id}>
      <BlockImage block={block} hero />
      <div className="container landing-hero-copy">
        {index === 0 ? <h1>{block.title}</h1> : <h2>{block.title}</h2>}
        {block.body && <p className="intro">{block.body}</p>}
        <div className="hero-actions">
          <Link className="primary" href="/cadastro">Criar conta</Link>
          <Link className="secondary" href="/planos">Ver planos</Link>
        </div>
      </div>
    </section>)}
    {segments.length > 0 && <section className="container section" id="segmentos">
      <p className="eyebrow">Beleza e bem-estar</p>
      <h2>Encontre o seu segmento</h2>
      <ul className="specialties">{segments.map((block) => <li key={block.id}>
        <BlockImage block={block} />
        {block.title}{block.body && <p>{block.body}</p>}
      </li>)}</ul>
    </section>}
    {features.length > 0 && <section className="landing-features" id="funcionalidades">
      <div className="container section">
        <h2>Da reserva ao fechamento do dia</h2>
        <ul className="cards">
          {features.map((block) => <li key={block.id} className="card">
            <BlockImage block={block} /><h3>{block.title}</h3><p>{block.body}</p>
          </li>)}
        </ul>
      </div>
    </section>}
    {retail.length > 0 && <section className="container section" id="estoque">
      {retail.map((block) => <article key={block.id} className="retail-showcase">
        <div><h2>{block.title}</h2><p>{block.body}</p></div>
        <BlockImage block={block} />
      </article>)}
    </section>}
    {questions.length > 0 && <section id="duvidas" className="container section">
      <h2>Perguntas frequentes</h2>
      {questions.map((block) => <details key={block.id}>
        <summary>{block.title}</summary><p>{block.body}</p><BlockImage block={block} />
      </details>)}
    </section>}
  </>;
}
