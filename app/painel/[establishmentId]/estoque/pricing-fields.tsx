"use client";

import { useState } from "react";
import { parsePrice } from "../../../../lib/establishments";
import { bundleSizes, formatStockPrice, markupTier, markedUp, parseMarkup, priceInput, type Margins, type MarginTier } from "../../../../lib/stock-pricing";

export function StockPricingFields({ margins, tier, markup, cost, price }: {
  margins: Margins; tier?: MarginTier | null; markup?: number | null; cost?: number | null; price?: number;
}) {
  const [rate, setRate] = useState(String(markup ?? (tier ? margins[tier] : "")));
  const [input, setInput] = useState(priceInput(cost));
  const [manual, setManual] = useState(priceInput(price));
  const cents = parsePrice(input);
  const percent = parseMarkup(rate);
  const automatic = rate !== "";
  const profile = percent === null ? null : markupTier(percent);
  const sale = automatic ? (percent !== null && cents !== null ? markedUp(cents, percent) : null) : parsePrice(manual);
  const profit = cents !== null && sale !== null ? sale - cents : null;

  return <>
    <label>Margem sobre o custo (%) <input name="markup" type="number" min={0} max={400} step={1}
      placeholder="Em branco para preço manual" value={rate} onChange={(event) => setRate(event.target.value)} /></label>
    <p aria-live="polite">{profile ? <strong className="stock-margin-profile" data-tier={profile}>
      {profile === "alta" ? "Alta" : profile === "media" ? "Média" : "Baixa"} · {percent}%
    </strong> : "Informe de 0% a 400% para calcular o preço automaticamente."}</p>
    <label>Custo unitário (R$) <input name="cost" inputMode="decimal" required={automatic} value={input} onChange={(event) => setInput(event.target.value)} /></label>
    <label>Preço de venda (R$) <input name="price" inputMode="decimal" required={!automatic} readOnly={automatic}
      value={automatic ? priceInput(sale) : manual} onChange={(event) => setManual(event.target.value)} /></label>
    <label>Lucro bruto por unidade <output aria-live="polite">{profit === null ? "—" : formatStockPrice(profit)}</output></label>
  </>;
}

export function BundlePricingFields({ cost, stock }: { cost: number | null; stock: number }) {
  const [units, setUnits] = useState(3);
  const [markup, setMarkup] = useState("0");
  const rate = Number(markup);
  return <>
    <label>Unidades por oferta <select name="bundle_units" value={units} onChange={(event) => setUnits(Number(event.target.value))}>
      {bundleSizes.map((size) => <option key={size} value={size} disabled={stock < size}>{size} unidades</option>)}
    </select></label>
    <label>Acréscimo sobre o custo do grupo (%) <input type="number" name="bundle_markup" min={0} max={20} step={1} required value={markup} onChange={(event) => setMarkup(event.target.value)} /></label>
    {cost && stock >= units && markup && rate >= 0 && rate <= 20 ? <p>
      Custo do grupo: {formatStockPrice(cost * units)}. Preço da oferta: <strong>{formatStockPrice(markedUp(cost * units, rate))}</strong>.
    </p> : <p>Informe um custo válido e tenha estoque suficiente para montar o grupo.</p>}
  </>;
}
