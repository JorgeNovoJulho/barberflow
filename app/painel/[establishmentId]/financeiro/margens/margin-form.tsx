"use client";

import { useState } from "react";
import { formatStockPrice, marginTypes, markedUp, type Margins } from "../../../../../lib/stock-pricing";
import { SubmitButton } from "../../../../auth/submit";
import { saveMargins } from "./actions";

export function MarginForm({ shop, margins }: { shop: string; margins: Margins }) {
  const [rates, setRates] = useState<Record<string, string>>({ alta: String(margins.alta), media: String(margins.media), baixa: String(margins.baixa) });
  return <form className="account-form card panel-form" action={saveMargins.bind(null, shop)}>
    {marginTypes.map(({ id, label, min, max }) => {
      const rate = Number(rates[id]);
      return <fieldset key={id}>
        <legend>Margem {label.toLowerCase()}</legend>
        <label>Acréscimo sobre o custo (%) <input name={id} type="number" min={min} max={max} step={1} value={rates[id]}
          onChange={(event) => setRates({ ...rates, [id]: event.target.value })} required /></label>
        <p>{rate >= min && rate <= max && Number.isInteger(rate)
          ? `Exemplo: R$ 100,00 de custo + ${rate}% = ${formatStockPrice(markedUp(10000, rate))} de preço de venda.`
          : `Informe um percentual inteiro de ${min}% a ${max}%.`}</p>
      </fieldset>;
    })}
    <SubmitButton>Salvar margens</SubmitButton>
  </form>;
}
