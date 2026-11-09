import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { changeServiceAvailability, moveService, saveService } from "../../actions";
import { PanelStatus } from "../../status";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Service = {
  id: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  display_order: number;
  duration_minutes: number;
  active: boolean;
};

function ServiceForm({ establishmentId, service }: { establishmentId: string; service?: Service }) {
  return <form className="account-form" action={saveService.bind(null, establishmentId, service?.id ?? null)}>
    <label>Nome <input name="name" required maxLength={120} defaultValue={service?.name} /></label>
    <label>Descrição <textarea name="description" maxLength={1000} rows={3} defaultValue={service?.description} /></label>
    <label>Categoria <input name="category" maxLength={80} defaultValue={service?.category} /></label>
    <div className="form-columns">
      <label>Valor (R$) <input name="price" inputMode="decimal" required placeholder="0,00"
        defaultValue={service ? (service.price_cents / 100).toFixed(2).replace(".", ",") : undefined} /></label>
      <label>Duração (min) <input name="duration" type="number" min={1} max={1440} required defaultValue={service?.duration_minutes ?? 30} /></label>
    </div>
    <label>Ordem no catálogo <input name="order" type="number" min={0} max={9999} defaultValue={service?.display_order ?? 0} required /></label>
    <SubmitButton>Salvar serviço</SubmitButton>
  </form>;
}

export default async function Services({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { establishmentId } = await params;
  if (!isUuid(establishmentId)) notFound();
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: `/painel/${establishmentId}/servicos` }));

  const { data: establishment, error: establishmentError } = await supabase.from("barberflow_establishments")
    .select("name").eq("id", establishmentId).maybeSingle();
  if (establishmentError) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!establishment) notFound();

  const { data: services, error } = await supabase.from("barberflow_services")
    .select("id,name,description,category,price_cents,duration_minutes,active,display_order")
    .eq("establishment_id", establishmentId).order("active", { ascending: false }).order("display_order").order("name").order("id");
  const { estado } = await searchParams;

  return <section className="container section">
    <Link href="/painel">Meus estabelecimentos</Link>
    <p className="eyebrow">{establishment.name}</p>
    <h1>Serviços</h1>
    <PanelStatus status={estado} />
    {error ? <p role="alert">Não foi possível carregar os serviços.</p> : <>
      <div className="card panel-form"><h2>Novo serviço</h2><ServiceForm establishmentId={establishmentId} /></div>
      <h2>Catálogo</h2>
      <p>A ordem dos serviços ativos também aparece na página pública.</p>
      {services?.length ? <ul className="cards">
        {services.map((service: Service, index) => <li className="card" key={service.id}>
          <h3>{service.name}</h3>
          <p>{currency.format(service.price_cents / 100)} · {service.duration_minutes} min · {service.active ? "Ativo" : "Arquivado"}</p>
          {service.category && <p>{service.category}</p>}
          {service.description && <p>{service.description}</p>}
          <details><summary>Editar serviço</summary><ServiceForm establishmentId={establishmentId} service={service} /></details>
          {service.active && <div className="account-links">
            {([-1, 1] as const).map((step) => {
              const neighbor = services[index + step];
              const label = step === -1 ? "Mover para cima" : "Mover para baixo";
              return neighbor?.active ? <form key={step} aria-label={`${label}: ${service.name}`}
                action={moveService.bind(null, establishmentId, service.id, neighbor.id, step)}>
                <SubmitButton>{label}</SubmitButton>
              </form> : <button key={step} className="secondary" type="button" disabled>{label}</button>;
            })}
          </div>}
          <form className="account-links" action={changeServiceAvailability.bind(null, establishmentId, service.id, !service.active)}>
            <SubmitButton>{service.active ? "Arquivar serviço" : "Reativar serviço"}</SubmitButton>
          </form>
        </li>)}
      </ul> : <p>Nenhum serviço cadastrado.</p>}
    </>}
  </section>;
}
