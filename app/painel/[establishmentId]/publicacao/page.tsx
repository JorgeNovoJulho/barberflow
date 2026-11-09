import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { savePublication } from "./actions";
import { businessDays, profileFields, readBusinessProfile } from "../../../../lib/business-profile";
import { CopyHours, GalleryEditor, PostalLookup, ProfileColors, ProfileMediaUpload } from "./form-tools";
import { ShareProfile } from "../../../estabelecimento/[slug]/profile-controls";

const feedback: Record<string, string> = {
  salvo: "Configurações da página salvas.",
  invalido: "Confira a cidade e use um endereço com letras minúsculas, números e hífens.",
  ocupado: "Esse endereço já está em uso.",
  regras: "Confira os limites e intervalos das regras de reserva.",
  perfil: "Confira o nome, o endereço, os contatos, os links HTTPS e os horários de funcionamento.",
  falha: "Não foi possível salvar a página.",
};

export default async function Publication({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: `/painel/${shop}/publicacao` }));
  const { data, error } = await supabase.from("barberflow_establishments")
    .select("name,slug,city,public_description,profile_details,published,auto_confirm,allow_customer_cancel,allow_customer_reschedule,min_notice_minutes,max_advance_days,change_notice_hours,slot_step_minutes,preparation_minutes").eq("id", shop).maybeSingle();
  if (error) throw new Error("Não foi possível carregar a publicação.");
  if (!data) notFound();
  const { estado } = await searchParams;
  const profile = readBusinessProfile(data.profile_details);
  const fields = (keys: readonly string[]) => profileFields.filter(({ key }) => keys.includes(key)).map(({ key, label, max }) =>
    <div key={key}>
      <label>{key === "address" ? "Rua / logradouro" : label}
        <input name={key} maxLength={max} defaultValue={profile[key]} />
      </label>
      {(key === "logo" || key === "cover" || key === "video") && <ProfileMediaUpload shop={shop} target={key} />}
    </div>);
  const path = "/painel/" + shop;

  return <section className="container section publication-editor">
    <header className="module-heading">
      <Link className="module-back" href="/painel">Meus estabelecimentos</Link>
      <p className="eyebrow">{data.name}</p>
      <h1>Página pública</h1>
      <p>Organize a apresentação do estabelecimento e configure como os clientes podem reservar.</p>
    </header>
    {estado && Object.hasOwn(feedback, estado) && <p className="publication-feedback" role="status">{feedback[estado]}</p>}
    <div className="publication-layout">
      <aside className="card publication-sidebar" aria-labelledby="publication-status">
        <p className="eyebrow">Visibilidade</p>
        <h2 id="publication-status">{data.published ? "Página publicada" : "Página em rascunho"}</h2>
        <p>{data.published ? "Seu perfil está visível no catálogo." : "Use a prévia para conferir o perfil antes de publicar."}</p>
        <div className="publication-actions">
          <Link className="primary" href={path + "/publicacao/previa"}>Ver prévia da página</Link>
          {data.published && <Link className="secondary" href={"/estabelecimento/" + data.slug}>Abrir página pública</Link>}
          <Link className="secondary" href={path + "/vitrine"}>Vendas e Pix da vitrine</Link>
          {data.published && <ShareProfile title={data.name} path={"/estabelecimento/" + data.slug} />}
        </div>
        <nav className="publication-jump" aria-label="Seções do editor">
          <a href="#perfil">Perfil</a><a href="#identidade">Identidade e mídia</a><a href="#contato">Endereço e contato</a>
          <a href="#horarios">Horários</a><a href="#reservas">Reservas online</a>
        </nav>
      </aside>
      <form className="account-form publication-form" action={savePublication.bind(null, shop)}>
        <section className="card publication-card" id="perfil">
          <h2>Perfil</h2>
          <div className="publication-columns">
            <label>Nome do estabelecimento <input name="name" required maxLength={120} defaultValue={data.name} /></label>
            <label>Endereço da página <input name="slug" minLength={3} maxLength={80} defaultValue={data.slug ?? ""} placeholder="meu-estudio" /></label>
          </div>
          <label>Descrição <textarea name="description" maxLength={1200} rows={4} defaultValue={data.public_description} /></label>
        </section>
        <section className="card publication-card" id="identidade">
          <h2>Identidade e mídia</h2>
          <div className="publication-columns">{fields(["logo", "cover"])}</div>
          {fields(["video"])}
          <ProfileColors initial={profile.color} />
          <GalleryEditor shop={shop} initial={profile.gallery ?? []} />
        </section>
        <section className="card publication-card" id="contato">
          <h2>Endereço e contato</h2>
          <PostalLookup initial={profile.postalCode} />
          <div className="publication-columns">
            <label>Cidade <input name="city" maxLength={100} defaultValue={data.city} /></label>
            {fields(["address", "number", "complement", "neighborhood", "region", "map", "whatsapp", "instagram", "facebook", "tiktok", "youtube"])}
          </div>
        </section>
        <fieldset className="card publication-card" id="horarios"><legend>Horário de funcionamento</legend>
          {businessDays.map((label, day) => {
            const hours = profile.hours?.[day];
            return <details key={label}>
              <summary>{label}</summary>
              <label><input type="checkbox" name={`open-${day}`} defaultChecked={!!hours} /> Aberto</label>
              <div className="form-columns">
                <label>Abre às <input name={`start-${day}`} type="time" defaultValue={hours?.start} /></label>
                <label>Fecha às <input name={`end-${day}`} type="time" defaultValue={hours?.end} /></label>
                <label>Início do intervalo <input name={`break-start-${day}`} type="time" defaultValue={hours?.breakStart} /></label>
                <label>Fim do intervalo <input name={`break-end-${day}`} type="time" defaultValue={hours?.breakEnd} /></label>
              </div>
              <CopyHours day={day} />
            </details>;
          })}
        </fieldset>

        <fieldset className="card publication-card" id="reservas"><legend>Regras de reserva online</legend>
          <label><input type="checkbox" name="auto_confirm" defaultChecked={data.auto_confirm} /> Confirmar automaticamente</label>
          <label><input type="checkbox" name="allow_customer_cancel" defaultChecked={data.allow_customer_cancel} /> Permitir cancelamento pelo cliente</label>
          <label><input type="checkbox" name="allow_customer_reschedule" defaultChecked={data.allow_customer_reschedule} /> Permitir remarcação pelo cliente</label>
          <div className="form-columns">
            <label>Antecedência mínima (min) <input name="min_notice_minutes" type="number" required min={0} max={10080} defaultValue={data.min_notice_minutes} /></label>
            <label>Reservar até (dias) <input name="max_advance_days" type="number" required min={1} max={365} defaultValue={data.max_advance_days} /></label>
            <label>Prazo para alterações (horas antes) <input name="change_notice_hours" type="number" required min={0} max={720} defaultValue={data.change_notice_hours} /></label>
            <label>Preparação entre atendimentos (min) <input name="preparation_minutes" type="number" required min={0} max={180} defaultValue={data.preparation_minutes} /></label>
            <label>Grade de horários <select name="slot_step_minutes" defaultValue={data.slot_step_minutes}>
              {[5, 10, 15, 20, 30, 60].map((step) => <option key={step} value={step}>A cada {step} min</option>)}
            </select></label>
          </div>
        </fieldset>
        <div className="card publication-save">
          <label><input type="checkbox" name="published" defaultChecked={data.published} /> Publicar página e aceitar reservas online</label>
          <SubmitButton>Salvar publicação e regras</SubmitButton>
        </div>
      </form>
    </div>
  </section>;
}
