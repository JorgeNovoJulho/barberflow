"use client";

import { useState } from "react";

export function CashReceived({ total }: { total: number }) {
  const [amount, setAmount] = useState("");
  const normalized = amount.trim().replace(",", ".");
  const cents = /^\d{1,8}(\.\d{1,2})?$/.test(normalized) ? Math.round(Number(normalized) * 100) : null;
  const change = cents === null ? null : cents - total;
  const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
  return <>
    <label>Valor recebido em dinheiro (R$)
      <input name="cash" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.currentTarget.value)} required />
    </label>
    <p aria-live="polite">{change === null ? "Informe o valor recebido." : change < 0 ? `Faltam ${money(-change)}.` : change === 0 ? "Valor exato." : `Troco de ${money(change)}.`}</p>
    <button className="primary" name="method" value="cash" disabled={change === null || change < 0}>Confirmar recebimento em dinheiro</button>
  </>;
}
