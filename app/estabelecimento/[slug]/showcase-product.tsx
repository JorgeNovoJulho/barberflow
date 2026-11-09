"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { type ShowcaseProduct, showcaseTotal } from "../../../lib/showcase";
import { SubmitButton } from "../../auth/submit";
import { ProductGallery, type ProductMedia } from "../../painel/[establishmentId]/estoque/product-gallery";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ShowcaseCard({ product, media, login, canBuy, preview, buyAction }: {
  product: ShowcaseProduct;
  media: ProductMedia[];
  login: string;
  canBuy: boolean;
  preview: boolean;
  buyAction: (form: FormData) => Promise<void>;
}) {
  const [units, setUnits] = useState(1);
  const request = useRef("");
  async function checkout(form: FormData) {
    request.current ||= crypto.randomUUID();
    form.set("requestId", request.current);
    await buyAction(form);
  }
  const max = Math.min(product.available, 100);
  const total = showcaseTotal(product, units);
  return <li className="card stock-product showcase-card">
    <details>
      <summary>
        {media[0] && <img className="showcase-cover" src={media[0].url} alt="" loading="lazy" />}
        <strong>{product.name}</strong>
        <span>{currency.format(product.price_cents / 100)} por unidade</span>
        <span className="showcase-open">Ver fotos e detalhes</span>
      </summary>
      <ProductGallery name={product.name} items={media} />
      {product.description && <p className="showcase-description">{product.description}</p>}
      {product.bundle_units && product.bundle_cents !== null &&
        <p className="stock-label stock-label-active">{product.bundle_units} un. por {currency.format(product.bundle_cents / 100)}</p>}
      {preview ? <p>Prévia do produto.</p>
        : !product.pix_enabled ? <p>Pagamento online indisponível.</p>
        : !canBuy ? <Link className="primary" href={login}>Entrar para comprar</Link>
        : <form className="account-form" action={checkout}>
          <label>Quantidade <input name="units" type="number" min={1} max={max} defaultValue={1} required
            onChange={(event) => setUnits(event.currentTarget.valueAsNumber || 0)} /></label>
          <input type="hidden" name="quoted" value={total} />
          <p><strong>Total {currency.format(total / 100)}</strong></p>
          <SubmitButton disabled={units < 1 || units > max || total > 99999999}>Comprar com Pix</SubmitButton>
        </form>}
    </details>
  </li>;
}
