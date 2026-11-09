import Link from "next/link";
import { supabaseServer } from "../../../lib/supabase";
import { productMediaSlots, productPhotoBucket, productVideoBucket } from "../../../lib/product-media";
import type { ShowcaseProduct } from "../../../lib/showcase";
import { placeShowcaseOrder } from "./showcase-action";
import { ShowcaseCard } from "./showcase-product";

const feedback: Record<string, string> = {
  conta: "Use uma conta ativa com e-mail confirmado para comprar.",
  invalido: "Confira a quantidade e o valor do pedido.",
  limite: "Você já tem três pedidos com reserva ativa. Acompanhe em Minhas compras.",
  preco: "O preço mudou. Confira o total atualizado e tente novamente.",
  indisponivel: "Não foi possível reservar o produto nessa quantidade. Confira a disponibilidade e tente novamente.",
};

export async function Showcase({ slug, previewShop, status, page }: { slug: string; previewShop?: string; status?: string; page?: string }) {
  const supabase = await supabaseServer();
  if (!supabase) return null;
  const pageNumber = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  const [catalog, session] = await Promise.all([
    supabase.rpc("barberflow_showcase_products", { profile_slug: slug, preview_shop: previewShop ?? null, page_number: pageNumber }),
    previewShop ? null : supabase.auth.getUser(),
  ]);
  const user = session?.data.user;
  const canBuy = !!user?.email_confirmed_at && !user.is_anonymous;
  const products = (catalog.data ?? []) as ShowcaseProduct[];
  const photos = productMediaSlots.slice(0, -1);
  const signed = new Map<string, string>();
  for (let start = 0; start < products.length; start += 100) {
    const batch = products.slice(start, start + 100).flatMap(({ shop_id, id }) => photos.map((slot) => `${shop_id}/${id}/${slot}`));
    const result = await supabase.storage.from(productPhotoBucket).createSignedUrls(batch, 300);
    for (const file of result.data ?? []) {
      if (!file.error && file.path && file.signedUrl) signed.set(file.path, file.signedUrl);
    }
  }
  const videos = products.length ? await supabase.storage.from(productVideoBucket)
    .createSignedUrls(products.map(({ shop_id, id }) => `${shop_id}/${id}/video`), 300) : null;
  for (const file of videos?.data ?? []) if (!file.error && file.path && file.signedUrl) signed.set(file.path, file.signedUrl);
  const pageCount = Math.ceil(Number(products[0]?.total_count ?? 0) / 30);
  const link = (target: number) => `?produtos=${target}#vitrine`;
  const login = "/login?" + new URLSearchParams({ next: `/estabelecimento/${slug}` });
  return <section className="profile-section" id="vitrine">
    <h2>Vitrine de produtos</h2>
    <p>Compre online e retire no estabelecimento após a confirmação.</p>
    {status && Object.hasOwn(feedback, status) && <p role="alert">{feedback[status]}</p>}
    {catalog.error ? <p role="alert">A vitrine está indisponível no momento.</p>
      : products.length === 0 ? <p>Nenhum produto disponível na vitrine.</p>
      : <ul className="cards showcase-grid">{products.map((product) => <ShowcaseCard key={product.id} product={product}
        preview={!!previewShop} login={login} canBuy={canBuy} buyAction={placeShowcaseOrder.bind(null, slug, product.id)}
        media={productMediaSlots.flatMap((slot) => {
          const url = signed.get(`${product.shop_id}/${product.id}/${slot}`);
          return url ? [{ slot, kind: slot === "video" ? "video" : "photo", url }] : [];
        })} />)}</ul>}
    {(pageNumber > 1 || pageCount > 1) && <nav className="account-links" aria-label="Páginas da vitrine">
      {pageNumber > 1 && <Link className="secondary" href={link(products.length ? pageNumber - 1 : 1)}>{products.length ? "Anterior" : "Voltar à primeira página"}</Link>}
      {products.length > 0 && <span>Página {pageNumber} de {pageCount}</span>}
      {pageNumber < pageCount && <Link className="secondary" href={link(pageNumber + 1)}>Próxima</Link>}
    </nav>}
  </section>;
}
