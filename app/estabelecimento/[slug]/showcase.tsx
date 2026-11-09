import { supabaseServer } from "../../../lib/supabase";
import { productMediaSlots, productPhotoBucket } from "../../../lib/product-media";
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

export async function Showcase({ slug, previewShop, status }: { slug: string; previewShop?: string; status?: string }) {
  const supabase = await supabaseServer();
  if (!supabase) return null;
  const [catalog, session] = await Promise.all([
    supabase.rpc("barberflow_showcase_products", { profile_slug: slug, preview_shop: previewShop ?? null }),
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
  const login = "/login?" + new URLSearchParams({ next: `/estabelecimento/${slug}` });
  return <section className="profile-section" id="vitrine">
    <h2>Vitrine de produtos</h2>
    <p>Compre online e retire no estabelecimento após a confirmação.</p>
    {status && Object.hasOwn(feedback, status) && <p role="alert">{feedback[status]}</p>}
    {catalog.error ? <p role="alert">A vitrine está indisponível no momento.</p>
      : products.length === 0 ? <p>Nenhum produto disponível na vitrine.</p>
      : <ul className="cards">{products.map((product) => <ShowcaseCard key={product.id} product={product}
        preview={!!previewShop} login={login} canBuy={canBuy} buyAction={placeShowcaseOrder.bind(null, slug, product.id)}
        media={photos.flatMap((slot) => {
          const url = signed.get(`${product.shop_id}/${product.id}/${slot}`);
          return url ? [{ slot, kind: "photo", url }] : [];
        })} />)}</ul>}
  </section>;
}
