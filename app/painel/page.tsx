import Link from "next/link";
import { redirect } from "next/navigation";
import { segments, isSegment } from "../../lib/establishments";
import { supabaseServer } from "../../lib/supabase";
import { SubmitButton } from "../auth/submit";
import { createEstablishment } from "./actions";
import { PanelStatus } from "./status";

export default async function Panel({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?next=%2Fpainel");

  const [{ data: businesses, error }, team] = await Promise.all([
    supabase.from("barberflow_establishments").select("id,name,segment").order("name"),
    supabase.rpc("barberflow_my_team_shops"),
  ]);
  const { estado } = await searchParams;

  return <section className="container section">
    <p className="eyebrow">Painel BARBERFLOW</p>
    <h1>Meus estabelecimentos</h1>
    <PanelStatus status={estado} />
    {!!team.data?.length && <section className="panel-form">
      <h2>Minhas equipes</h2>
      <ul className="cards">{(team.data as { id: string; name: string }[]).map((shop) => <li className="card" key={shop.id}>
        <Link href={`/equipe/${shop.id}`}>{shop.name} · Abrir agenda</Link>
      </li>)}</ul>
    </section>}
    {error ? <p role="alert">Não foi possível carregar seus estabelecimentos.</p>
      : businesses?.length ? <ul className="cards">
        {businesses.map(({ id, name, segment }) => <li className="card" key={id}>
          <h2>{name}</h2>
          <p>{isSegment(segment) ? segments[segment] : segment}</p>
          <div className="account-links">
            <Link className="primary" href={`/painel/${id}/resumo`}>Visão geral</Link>
            <Link className="secondary" href={`/painel/${id}/servicos`}>Serviços</Link>
            <Link className="secondary" href={`/painel/${id}/profissionais`}>Profissionais</Link>
            <Link className="secondary" href={`/painel/${id}/agenda`}>Agenda</Link>
            <Link className="secondary" href={`/painel/${id}/clientes`}>Clientes</Link>
            <Link className="secondary" href={`/painel/${id}/publicacao`}>Página pública</Link>
            <Link className="secondary" href={`/painel/${id}/estoque`}>Estoque</Link>
            <Link className="secondary" href={`/painel/${id}/fidelidade`}>Fidelidade</Link>
            <Link className="secondary" href={`/painel/${id}/financeiro`}>Financeiro</Link>
            <Link className="secondary" href={`/painel/${id}/assinatura`}>Assinatura</Link>
          </div>
        </li>)}
      </ul> : <p>Cadastre seu primeiro estabelecimento para configurar os serviços.</p>}
    <div className="card panel-form">
      <h2>Novo estabelecimento</h2>
      <form className="account-form" action={createEstablishment}>
        <label>Nome <input name="name" required maxLength={120} /></label>
        <label>Segmento <select name="segment" defaultValue="" required>
          <option value="" disabled>Selecione o segmento</option>
          {Object.entries(segments).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <SubmitButton disabled={Boolean(error)}>Cadastrar estabelecimento</SubmitButton>
      </form>
    </div>
  </section>;
}
