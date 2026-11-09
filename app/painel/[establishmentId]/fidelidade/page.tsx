import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { redeemLoyalty, saveLoyalty } from "./actions";

const feedback: Record<string, string> = {
  salvo: "Regras de fidelidade salvas.",
  resgatado: "Benefício registrado.",
  insuficiente: "O benefício não está disponível para este cliente.",
  invalido: "Confira os dados do programa.",
  falha: "Não foi possível concluir a operação.",
};

type FreeSlot = { slot: string; professional_id: string; professional_name: string; service_id: string; service_name: string };

export default async function Loyalty({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: `/painel/${shop}/fidelidade` }));
  const { data: business, error } = await supabase.from("barberflow_establishments").select("name,published").eq("id", shop).maybeSingle();
  if (error) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!business) notFound();

  const [rule, services, progress, history, availability] = await Promise.all([
    supabase.from("barberflow_loyalty_rules").select("enabled,visits_required,reward,service_ids").eq("establishment_id", shop).maybeSingle(),
    supabase.from("barberflow_services").select("id,name,active").eq("establishment_id", shop).order("name"),
    supabase.rpc("barberflow_loyalty_progress", { shop }),
    supabase.from("barberflow_loyalty_redemptions").select("id,client_id,reward,redeemed_at,barberflow_clients(name)").eq("establishment_id", shop)
      .order("redeemed_at", { ascending: false }).limit(30),
    business.published ? supabase.rpc("barberflow_loyalty_slots", { shop }) : null,
  ]);
  const { estado } = await searchParams;
  const target = rule.data?.visits_required ?? 5;
  const people = (progress.data ?? []) as { client_id: string; client_name: string; visits: number }[];
  const slots = (availability?.data ?? []) as FreeSlot[];
  return <section className="container section">
    <nav className="account-links" aria-label="Estabelecimento">
      <Link href="/painel">Meus estabelecimentos</Link>
      <Link href={`/painel/${shop}/clientes`}>Clientes</Link>
      <Link href={`/painel/${shop}/agenda`}>Agenda</Link>
    </nav>
    <p className="eyebrow">{business.name}</p><h1>Fidelidade</h1>
    {estado && Object.hasOwn(feedback, estado) && <p role="status">{feedback[estado]}</p>}
    {[rule, services, progress, history].some((item) => item.error) ? <p role="alert">Não foi possível carregar o programa de fidelidade.</p> : <>
      <div className="card panel-form">
        <h2>Regras do programa</h2>
        <form className="account-form" action={saveLoyalty.bind(null, shop)}>
          <label><input name="enabled" type="checkbox" defaultChecked={rule.data?.enabled} /> Programa ativo</label>
          <label>Atendimentos necessários <input name="target" type="number" min={1} max={100} defaultValue={target} required /></label>
          <label>Benefício <input name="benefit" maxLength={200} defaultValue={rule.data?.reward} placeholder="Ex.: hidratação cortesia" required /></label>
          <fieldset><legend>Serviços que contam para o programa</legend>
            <p>Se deixar todos desmarcados, qualquer serviço conta.</p>
            {(services.data ?? []).map((service) => <label key={service.id}>
              <input type="checkbox" name="service" value={service.id} defaultChecked={rule.data?.service_ids.includes(service.id)} /> {service.name}{service.active ? "" : " (arquivado)"}
            </label>)}
          </fieldset>
          <SubmitButton>Salvar regras</SubmitButton>
        </form>
      </div>
      <h2>Clientes mais próximos do benefício</h2>
      <p>Até 100 clientes, ordenados pelo número de atendimentos elegíveis ainda disponíveis para resgate.</p>
      {!rule.data?.enabled ? <p>Ative o programa para acompanhar o progresso.</p> : people.length ? <ul className="cards">
        {people.map((person) => <li className="card" key={person.client_id}>
          <h3>{person.client_name}</h3>
          <p>{person.visits} de {target} atendimentos · {person.visits >= target ? "Benefício disponível" : `Faltam ${target - person.visits}`}</p>
          <progress max={target} value={Math.min(person.visits, target)} aria-label={`Progresso de ${person.client_name}`} />
          {person.visits >= target && <details><summary>Resgatar benefício</summary>
            <p>{rule.data?.reward}</p>
            <form action={redeemLoyalty.bind(null, shop, person.client_id)}><SubmitButton>Confirmar resgate</SubmitButton></form>
          </details>}
        </li>)}
      </ul> : <p>Nenhum cliente ativo cadastrado.</p>}
      <section className="panel-form">
        <h2>Horários vagos de hoje</h2>
        {!business.published ? <p>Publique a página do estabelecimento para consultar os horários disponíveis para reserva online.</p>
          : availability?.error ? <p role="alert">Não foi possível consultar os horários.</p>
          : slots.length ? <>
            <p>Até 30 horários disponíveis para os serviços elegíveis, em ordem de início.</p>
            <ul className="cards">{slots.map(({ slot, professional_id, professional_name, service_id, service_name }) => {
              const query = new URLSearchParams({ dia: slot.slice(0, 10), novo: "1", profissional: professional_id, servico: service_id, horario: slot.slice(11, 16) });
              return <li className="card" key={`${slot}-${professional_id}-${service_id}`}>
                <strong>{slot.slice(11, 16)} · {service_name}</strong>
                <p>{professional_name}</p>
                <Link href={`/painel/${shop}/agenda?${query}#novo`}>Agendar neste horário</Link>
              </li>;
            })}</ul>
          </> : <p>Nenhum horário elegível disponível para reserva hoje.</p>}
      </section>
      <h2 className="panel-form">Últimos resgates</h2>
      {history.data?.length ? <ul className="cards">
        {history.data.map((item) => <li key={item.id} className="card"><strong>{item.reward}</strong>
          <p>{(item.barberflow_clients as unknown as { name?: string } | null)?.name ?? "Cliente"} · {new Date(item.redeemed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        </li>)}
      </ul> : <p>Nenhum benefício resgatado.</p>}
    </>}
  </section>;
}
