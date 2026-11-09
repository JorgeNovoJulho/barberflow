import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";
import { savePublication } from "./actions";
import { businessDays, profileFields, readBusinessProfile } from "../../../../lib/business-profile";
import { CopyHours, PostalLookup, ProfileMediaUpload } from "./form-tools";

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
  return <section className="container section">
    <Link href="/painel">Meus estabelecimentos</Link>
    <p className="eyebrow">{data.name}</p>
    <h1>Página pública</h1>
    {estado && Object.hasOwn(feedback, estado) && <p role="status">{feedback[estado]}</p>}
    <div className="card panel-form">
      <p>{data.published ? "Publicada no catálogo." : "Página não publicada."}</p>
      {data.published && <p><Link href={`/estabelecimento/${data.slug}`}>Abrir página pública</Link></p>}
      <form className="account-form" action={savePublication.bind(null, shop)}>
        <label>Nome do estabelecimento <input name="name" required maxLength={120} defaultValue={data.name} /></label>
        <label>Endereço da página <input name="slug" minLength={3} maxLength={80} defaultValue={data.slug ?? ""} placeholder="meu-estudio" /></label>
        <label>Descrição <textarea name="description" maxLength={1200} rows={4} defaultValue={data.public_description} /></label>
        <fieldset>
          <legend>Endereço, contatos e identidade visual</legend>
          <PostalLookup initial={profile.postalCode} />
          <label>Cidade <input name="city" maxLength={100} defaultValue={data.city} /></label>
          {profileFields.filter(({ key }) => key !== "postalCode").map(({ key, label, max }) => <div key={key}>
            <label>{key === "address" ? "Rua / logradouro" : label}
              <input name={key} maxLength={max} defaultValue={profile[key]} placeholder={key === "color" ? "#7C4EB0" : undefined} />
            </label>
            {(key === "logo" || key === "cover" || key === "video") && <ProfileMediaUpload shop={shop} target={key} />}
          </div>)}
          <label>Galeria do local (até 8 links HTTPS, um por linha)
            <textarea name="gallery" rows={4} defaultValue={profile.gallery?.join("\n")} />
          </label>
          <ProfileMediaUpload shop={shop} target="gallery" />
        </fieldset>
        <fieldset>
          <legend>Horário de funcionamento divulgado na página pública</legend>
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
        <label><input type="checkbox" name="published" defaultChecked={data.published} /> Publicar página e aceitar reservas online</label>
        <fieldset>
          <legend>Regras de reserva online</legend>
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
        <SubmitButton>Salvar publicação e regras</SubmitButton>
      </form>
    </div>
  </section>;
}
