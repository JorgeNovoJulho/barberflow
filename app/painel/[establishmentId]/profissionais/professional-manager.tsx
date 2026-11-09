import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { PanelStatus } from "../../status";
import { moveProfessional, saveAssignments, saveProfessional, saveWorkingDay } from "./actions";
import { httpsUrl } from "../../../../lib/business-profile";
import { productImageTypes } from "../../../../lib/product-media";
import { TeamInvite } from "./team-invite";
import { revokeTeamAccess } from "./team-actions";

const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

type Professional = { id: string; name: string; description: string; active: boolean; photo_url: string; commission_bps: number; product_commission_bps: number; inherit_business_hours: boolean;
  instagram: string; facebook: string; tiktok: string; youtube: string; whatsapp: string };
type Hours = { professional_id: string; weekday: number; starts_at: string; ends_at: string; break_start: string | null; break_end: string | null };

function ProfessionalForm({ shop, professional, delegated }: { shop: string; professional?: Professional; delegated: boolean }) {
  return <form className="account-form" action={saveProfessional.bind(null, shop, professional?.id ?? null, delegated)}>
    <label>Nome <input name="name" required maxLength={120} defaultValue={professional?.name} /></label>
    <label>Descrição <textarea name="description" maxLength={1000} rows={3} defaultValue={professional?.description} /></label>
    <fieldset>
      <legend>Foto do profissional</legend>
      {httpsUrl(professional?.photo_url) && <img className="business-logo" src={professional?.photo_url} alt="Foto salva do profissional" />}
      <label>Enviar foto do dispositivo <input name="photo_file" type="file" accept={productImageTypes.join(",")} /></label>
      <small>JPG, PNG, WebP ou AVIF, até 5 MB. A foto é enviada ao salvar.</small>
      <details><summary>Usar link da foto</summary>
        <label>URL da foto <input name="photo" type="url" maxLength={500} defaultValue={professional?.photo_url} /></label>
      </details>
    </fieldset>
    <fieldset>
      <legend>Redes sociais e contato</legend>
      <div className="publication-columns">
        <label>Instagram <input name="instagram" maxLength={31} placeholder="@usuario" defaultValue={professional?.instagram} /></label>
        <label>WhatsApp com DDD <input name="whatsapp" type="tel" maxLength={20} placeholder="(11) 99999-9999" defaultValue={professional?.whatsapp} /></label>
        <label>Facebook <input name="facebook" type="url" maxLength={500} defaultValue={professional?.facebook} /></label>
        <label>TikTok <input name="tiktok" type="url" maxLength={500} defaultValue={professional?.tiktok} /></label>
        <label>YouTube <input name="youtube" type="url" maxLength={500} defaultValue={professional?.youtube} /></label>
      </div>
    </fieldset>
    <div className="form-columns">
      <label>Comissão sobre serviços (%) <input name="commission" inputMode="decimal" defaultValue={(professional?.commission_bps ?? 0) / 100} required /></label>
      <label>Comissão sobre produtos (%) <input name="product_commission" inputMode="decimal" defaultValue={(professional?.product_commission_bps ?? 0) / 100} required /></label>
    </div>
    <label><input type="checkbox" name="inherit_business_hours" defaultChecked={professional?.inherit_business_hours} /> Usar o horário de funcionamento do estabelecimento</label>
    {professional && <label><input type="checkbox" name="active" defaultChecked={professional.active} /> Profissional ativo</label>}
    <SubmitButton>Salvar profissional</SubmitButton>
  </form>;
}

function DayForm({ shop, professional, day, hours, delegated }: { shop: string; professional: string; day: number; hours?: Hours; delegated: boolean }) {
  return <details>
    <summary>{weekdays[day]} · {hours ? `${hours.starts_at.slice(0, 5)}–${hours.ends_at.slice(0, 5)}` : "Sem expediente"}</summary>
    <form className="account-form" action={saveWorkingDay.bind(null, shop, professional, delegated)}>
      <input type="hidden" name="weekday" value={day} />
      <div className="form-columns">
        <label>Início <input name="starts_at" type="time" defaultValue={hours?.starts_at.slice(0, 5) ?? "09:00"} /></label>
        <label>Fim <input name="ends_at" type="time" defaultValue={hours?.ends_at.slice(0, 5) ?? "18:00"} /></label>
      </div>
      <div className="form-columns">
        <label>Início do intervalo <input name="break_start" type="time" defaultValue={hours?.break_start?.slice(0, 5)} /></label>
        <label>Fim do intervalo <input name="break_end" type="time" defaultValue={hours?.break_end?.slice(0, 5)} /></label>
      </div>
      {hours && <label><input type="checkbox" name="closed" /> Sem expediente neste dia</label>}
      <SubmitButton>Salvar horário</SubmitButton>
    </form>
  </details>;
}

export async function ProfessionalManager({ params, searchParams, delegated = false }: {
  params: Promise<{ establishmentId: string }>;
  delegated?: boolean;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: `/${delegated ? "equipe" : "painel"}/${shop}/profissionais` }));

  let businessName: string;
  if (delegated) {
    const [access, memberships] = await Promise.all([
      supabase.rpc("barberflow_team_can_edit_professionals", { shop }),
      supabase.rpc("barberflow_my_team_shops"),
    ]);
    const business = (memberships.data as { id: string; name: string }[] | null)?.find(({ id }) => id === shop);
    if (access.data !== true || !business) notFound();
    businessName = business.name;
  } else {
    const { data, error } = await supabase.from("barberflow_establishments").select("name").eq("id", shop).maybeSingle();
    if (error) throw new Error("Não foi possível carregar o estabelecimento.");
    if (!data) notFound();
    businessName = data.name;
  }
  const [professionals, services, assignments, hours, team] = await Promise.all([
    supabase.from("barberflow_professionals").select("id,name,description,active,photo_url,commission_bps,product_commission_bps,inherit_business_hours,instagram,facebook,tiktok,youtube,whatsapp")
      .eq("establishment_id", shop).order("active", { ascending: false }).order("display_order").order("name").order("id"),
    delegated ? supabase.rpc("barberflow_team_assignment_services", { shop })
      : supabase.from("barberflow_services").select("id,name,active").eq("establishment_id", shop).is("deleted_at", null).order("name"),
    supabase.from("barberflow_professional_services").select("professional_id,service_id").eq("establishment_id", shop),
    supabase.from("barberflow_professional_hours").select("professional_id,weekday,starts_at,ends_at,break_start,break_end").eq("establishment_id", shop),
    delegated ? Promise.resolve({ data: null, error: null }) : supabase.rpc("barberflow_team_members", { shop }),
  ]);
  const { estado } = await searchParams;

  return <section className="container section">
    <nav className="account-links" aria-label="Estabelecimento">
      <Link href={delegated ? `/equipe/${shop}` : "/painel"}>{delegated ? "Voltar à equipe" : "Meus estabelecimentos"}</Link>
      {!delegated && <Link href={`/painel/${shop}/servicos`}>Serviços</Link>}
    </nav>
    <p className="eyebrow">{businessName}</p>
    <h1>Profissionais</h1>
    <PanelStatus status={estado} />
    {[professionals, services, assignments, hours].some((response) => response.error) ? <p role="alert">Não foi possível carregar a equipe.</p> : <>
      <div className="card panel-form"><h2>Novo profissional</h2><ProfessionalForm shop={shop} delegated={delegated} /></div>
      <h2>Equipe</h2>
      {!professionals.data?.length && <p>Nenhum profissional cadastrado.</p>}
      {(professionals.data ?? []).map((professional: Professional, index) => {
        const selected = new Set((assignments.data ?? []).filter((item) => item.professional_id === professional.id).map((item) => item.service_id));
        const schedule = new Map((hours.data ?? []).filter((item: Hours) => item.professional_id === professional.id).map((item: Hours) => [item.weekday, item]));
        const available = ((services.data ?? []) as { id: string; name: string; active: boolean }[]).filter((service) => service.active || selected.has(service.id));
        return <article className="card panel-form" key={professional.id}>
          <h3>{professional.name}</h3><p>{professional.active ? "Ativo" : "Inativo"} · Serviços {professional.commission_bps / 100}% · Produtos {professional.product_commission_bps / 100}%</p>
          {professional.active && <div className="account-links">
            {([-1, 1] as const).map((step) => {
              const neighbor = professionals.data?.[index + step];
              const label = step === -1 ? "Mover para cima" : "Mover para baixo";
              return neighbor?.active ? <form key={step} aria-label={`${label}: ${professional.name}`}
                action={moveProfessional.bind(null, shop, professional.id, neighbor.id, step, delegated)}>
                <SubmitButton>{label}</SubmitButton>
              </form> : <button key={step} className="secondary" type="button" disabled>{label}</button>;
            })}
          </div>}
          <details><summary>Editar profissional</summary><ProfessionalForm shop={shop} delegated={delegated} professional={professional} /></details>
          <details><summary>Serviços vinculados · {selected.size}</summary>
            {available.length ? <form className="account-form" action={saveAssignments.bind(null, shop, professional.id, delegated)}>
              {available.map((service) => <label key={service.id}>
                <input type="checkbox" name="service" value={service.id} defaultChecked={selected.has(service.id)} /> {service.name}{service.active ? "" : " (arquivado)"}
              </label>)}
              <SubmitButton>Salvar vínculos</SubmitButton>
            </form> : <p>Cadastre pelo menos um serviço ativo no catálogo.</p>}
          </details>
          <details><summary>Horários de trabalho · {professional.inherit_business_hours ? "Segue o estabelecimento" : "Expediente próprio"}</summary>
            {professional.inherit_business_hours ? <p>{delegated ? "O expediente é definido pelo estabelecimento." : <Link href={`/painel/${shop}/publicacao`}>Editar o horário do estabelecimento</Link>}</p>
              : weekdays.map((name, day) => <DayForm delegated={delegated} key={name} shop={shop} professional={professional.id} day={day} hours={schedule.get(day)} />)}
          </details>
        </article>;
      })}
      {!delegated && <section className="panel-form">
        <h2>Equipe com acesso ao painel</h2>
        <details className="card"><summary>Convidar</summary>
          <TeamInvite shop={shop} professionals={(professionals.data ?? []).filter((person) => person.active)} />
        </details>
        {team.error ? <p role="alert">Não foi possível consultar os convites.</p> : team.data?.length ? <ul className="cards">
          {(team.data as { id: string; email: string; professional_id: string | null; see_all: boolean; manage_all: boolean; manage_clients: boolean; manage_services: boolean; manage_professionals: boolean; read_finance: boolean; expires_at: string; accepted_at: string | null }[]).map((member) => <li className="card" key={member.id}>
            <h3>{member.email}</h3>
            <p>{member.accepted_at ? "Aceito" : Date.parse(member.expires_at) <= Date.now() ? "Expirado" : "Pendente"} · {member.manage_all ? "Gerencia todas as agendas" : member.see_all ? "Visualiza todas as agendas" : member.professional_id ? "Gerencia a agenda vinculada" : "Sem acesso à agenda"}</p>
            {member.manage_clients && <p>Gerencia a base de clientes.</p>}
            {member.manage_services && <p>Gerencia serviços e preços.</p>}
            {member.manage_professionals && <p>Gerencia profissionais, horários e imagens.</p>}
            {member.read_finance && <p>Consulta relatórios financeiros.</p>}
            <p>Vínculo: {professionals.data?.find((person) => person.id === member.professional_id)?.name ?? "Nenhum"}</p>
            <form action={revokeTeamAccess.bind(null, shop, member.id)}><SubmitButton>Revogar acesso</SubmitButton></form>
          </li>)}
        </ul> : <p>Nenhum convite ou acesso ativo.</p>}
      </section>}
    </>}
  </section>;
}
