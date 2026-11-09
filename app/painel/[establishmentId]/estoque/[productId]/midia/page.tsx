import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../../../lib/establishments";
import { productPhotoBucket, productVideoBucket, productMediaSlots, productImageTypes, productVideoTypes } from "../../../../../../lib/product-media";
import { supabaseServer } from "../../../../../../lib/supabase";
import { SubmitButton } from "../../../../../auth/submit";
import { changeMedia } from "./actions";

const feedback: Record<string, string> = {
  produto: "Produto cadastrado. Você já pode enviar fotos e vídeo.",
  salva: "Arquivo salvo.",
  removida: "Arquivo removido.",
  foto: "Use uma foto JPG, PNG, WebP ou AVIF de até 5 MB.",
  video: "Use um vídeo MP4 ou WebM de até 20 MB.",
  falha: "Não foi possível concluir a operação com o arquivo.",
  invalido: "Posição inválida.",
};

export default async function ProductMedia({ params, searchParams }: {
  params: Promise<{ establishmentId: string; productId: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { establishmentId: shop, productId } = await params;
  if (!isUuid(shop) || !isUuid(productId)) notFound();
  const base = `/painel/${shop}/estoque`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: `${base}/${productId}/midia` }));
  const { data: product, error } = await supabase.from("barberflow_products").select("name")
    .eq("establishment_id", shop).eq("id", productId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("Não foi possível carregar o produto.");
  if (!product) notFound();

  const folder = `${shop}/${productId}`;
  const media = await Promise.all([productPhotoBucket, productVideoBucket].map(async (id) => {
    const bucket = supabase.storage.from(id);
    const listed = await bucket.list(folder, { limit: 6 });
    if (listed.error || !listed.data?.length) return { error: listed.error, urls: [] };
    const signed = await bucket.createSignedUrls(listed.data.map(({ name }) => `${folder}/${name}`), 3600);
    return { error: signed.error, urls: signed.data ?? [] };
  }));
  const urls = new Map(media.flatMap((group) => group.urls).map((item) => [item.path?.split("/").at(-1), item.signedUrl]));
  const { estado } = await searchParams;
  return <section className="container section">
    <Link href={base}>Voltar ao estoque</Link>
    <header className="operational-heading">
      <p className="eyebrow">{product.name}</p><h1>Fotos e vídeo</h1>
      <p>Envie até cinco fotos de 5 MB cada e um vídeo de até 20 MB. Os arquivos ficam disponíveis no painel do estabelecimento.</p>
    </header>
    {estado && Object.hasOwn(feedback, estado) && <p role="status">{feedback[estado]}</p>}
    {media.some(({ error }) => error) ? <p role="alert">Não foi possível carregar a mídia.</p> : <ul className="cards">
      {productMediaSlots.map((slot, index) => {
        const video = slot === "video";
        const url = urls.get(slot);
        const title = video ? "Vídeo" : `Foto ${index + 1}`;
        return <li key={slot} className="card stock-media-card">
          <h2>{title}</h2>
          {url ? (video
            ? <video className="product-media-preview" controls preload="metadata" src={url} />
            : <img className="product-media-preview" src={url} alt={`${title} de ${product.name}`} loading="lazy" />)
            : <p className="stock-media-empty">Nenhum arquivo nesta posição</p>}
          <form className="account-form" action={changeMedia.bind(null, shop, productId, slot, false)}>
            <label>{url ? "Substituir arquivo" : "Selecionar arquivo"} <input name="file" type="file" required
              accept={(video ? productVideoTypes : productImageTypes).join(",")} /></label>
            <SubmitButton>{url ? "Substituir" : "Enviar"}</SubmitButton>
          </form>
          {url && <form className="account-links" action={changeMedia.bind(null, shop, productId, slot, true)}>
            <SubmitButton>Remover arquivo</SubmitButton>
          </form>}
        </li>;
      })}
    </ul>}
  </section>;
}
