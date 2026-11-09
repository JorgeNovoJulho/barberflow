import Link from "next/link";
import { SubmitButton } from "../auth/submit";
import { sections, type LandingBlock } from "../../lib/landing";
import { requireMaster } from "../../lib/master";
import { deleteBlock, saveBlock } from "./actions";

const status: Record<string, string> = {
  salvo: "Conteúdo salvo.",
  excluido: "Bloco excluído da landing.",
  invalido: "Confira os campos antes de salvar.",
  imagem: "Use JPG, PNG, WebP ou AVIF com até 950 KB.",
  falha: "Não foi possível concluir a operação.",
};

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
  const { data, error } = await supabase.from("barberflow_landing_blocks").select("*").order("section").order("position").order("id");
  const { estado } = await searchParams;
  return <section className="container section">
    <p className="eyebrow">Administração master</p>
    <h1>Conteúdo da landing</h1>
    <Link href="/">Ver página pública</Link>
    <p><Link href="/gestao-master/avaliacoes">Moderação de avaliações</Link></p>
    <p><Link href="/gestao-master/assinaturas">Gestão de assinaturas</Link></p>
    {estado && Object.hasOwn(status, estado) && <p role="status">{status[estado]}</p>}
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
