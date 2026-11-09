import Link from "next/link";
import { SubmitButton } from "../auth/submit";
import { landingFields, parseLandingSettings, sections, type LandingBlock, type LandingSettings } from "../../lib/landing";
import { requireMaster } from "../../lib/master";
import { deleteBlock, saveBlock, saveLandingSettings } from "./actions";

const status: Record<string, string> = {
  salvo: "Conteúdo salvo.",
  aparencia: "Configurações da landing publicadas.",
  excluido: "Bloco excluído da landing.",
  invalido: "Confira os campos antes de salvar.",
  imagem: "Use JPG, PNG, WebP ou AVIF com até 950 KB.",
  falha: "Não foi possível concluir a operação.",
};

function AppearanceEditor({ settings }: { settings: LandingSettings }) {
  return <details className="card panel-form">
    <summary>Configurar aparência, navegação e rodapé</summary>
    <p>Os campos de destino aceitam caminhos internos ou endereços HTTPS. Para ocultar um botão opcional, deixe o texto ou o destino em branco.</p>
    <form className="account-form" action={saveLandingSettings}>
      {Object.entries(landingFields).map(([name, label]) => <label key={name}>{label}
        {name === "photoFocus" ? <select name={name} defaultValue={settings.photoFocus}>
          <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
        </select> : name === "overlay" ? <input type="number" name={name} min={50} max={95} required defaultValue={settings.overlay} />
          : <input type={name === "accent" ? "color" : "text"} name={name} maxLength={500}
            defaultValue={settings[name as keyof typeof landingFields]} />}
      </label>)}
      <label><input type="checkbox" name="discovery" defaultChecked={settings.discovery} /> Exibir busca de estabelecimentos</label>
      <label><input type="checkbox" name="motion" defaultChecked={settings.motion} /> Ativar animações na landing</label>
      <SubmitButton>Salvar configurações da landing</SubmitButton>
    </form>
  </details>;
}

function Editor({ block }: { block?: LandingBlock }) {
  return <form className="account-form" action={saveBlock.bind(null, block?.id ?? null)}>
    <label>Seção <select name="section" defaultValue={block?.section ?? "hero"}>
      {Object.entries(sections).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    <label>Título <input name="title" required maxLength={160} defaultValue={block?.title} /></label>
    <label>Texto <textarea name="body" maxLength={1200} defaultValue={block?.body} rows={3} /></label>
    <label>Endereço da imagem <input name="image_url" maxLength={1500} defaultValue={block?.image_url} /></label>
    <label>Enviar nova imagem <input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/avif" /></label>
    <label>Descrição da imagem <input name="image_alt" maxLength={240} defaultValue={block?.image_alt} /></label>
    <label>Ordem <input type="number" name="position" min={0} max={9999} required defaultValue={block?.position ?? 10} /></label>
    <label><input type="checkbox" name="published" defaultChecked={block?.published ?? true} /> Publicado</label>
    <SubmitButton>Salvar bloco</SubmitButton>
  </form>;
}

export default async function LandingAdmin({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const supabase = await requireMaster();
  const [{ data, error }, settings] = await Promise.all([
    supabase.from("barberflow_landing_blocks").select("*").order("section").order("position").order("id"),
    supabase.from("barberflow_landing_settings").select("appearance").single(),
  ]);
  const { estado } = await searchParams;
  return <section className="container section">
    <p className="eyebrow">Administração master</p>
    <h1>Conteúdo da landing</h1>
    <Link href="/">Ver página pública</Link>
    <p><Link href="/gestao-master/avaliacoes">Moderação de avaliações</Link></p>
    <p><Link href="/gestao-master/assinaturas">Gestão de assinaturas</Link></p>
    {estado && Object.hasOwn(status, estado) && <p role="status">{status[estado]}</p>}
    {settings.error ? <p role="alert">Não foi possível carregar as configurações da landing.</p>
      : <AppearanceEditor settings={parseLandingSettings(settings.data.appearance)} />}
    {error ? <p role="alert">Não foi possível carregar os blocos.</p> : <>
      <details className="card panel-form"><summary>Adicionar bloco</summary><Editor /></details>
      {(data as LandingBlock[]).map((block) => <details className="card panel-form" key={block.id}>
        <summary>{sections[block.section]} · {block.title}{block.published ? "" : " · Rascunho"}</summary>
        <Editor block={block} />
        <form className="account-links" action={deleteBlock.bind(null, block.id)}><SubmitButton>Excluir bloco da página</SubmitButton></form>
      </details>)}
    </>}
  </section>;
}
