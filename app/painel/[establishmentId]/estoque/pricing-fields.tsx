"use client";

import { useState } from "react";
import { parsePrice } from "../../../../lib/establishments";
import { bundleSizes, formatStockPrice, marginTypes, markedUp, priceInput, type Margins, type MarginTier } from "../../../../lib/stock-pricing";

export function StockPricingFields({ margins, tier, cost, price }: { margins: Margins; tier?: MarginTier | null; cost?: number | null; price?: number }) {
  const [choice, setChoice] = useState<MarginTier | "">(tier ?? "");
  const [input, setInput] = useState(priceInput(cost));
  const [manual, setManual] = useState(priceInput(price));
  const cents = parsePrice(input);
  const calculated = choice && cents && markedUp(cents, margins[choice]);
  return <>
    <label>Margem sobre o custo <select name="margin_tier" value={choice} onChange={(event) => setChoice(event.target.value as MarginTier | "")}>
      <option value="">Preço manual</option>
      {marginTypes.map(({ id, label }) => <option key={id} value={id}>{label} · {margins[id]}%</option>)}
    </select></label>
    <label>Custo unitário (R$) <input name="cost" inputMode="decimal" required={Boolean(choice)} value={input} onChange={(event) => setInput(event.target.value)} /></label>
    <label>Preço de venda (R$) <input name="price" inputMode="decimal" required={!choice} readOnly={Boolean(choice)}
      value={choice ? priceInput(calculated || null) : manual} onChange={(event) => setManual(event.target.value)} /></label>
    {Boolean(calculated) && <p>Preço de venda calculado sobre o custo unitário.</p>}
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
