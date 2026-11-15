"use client";

import { useId, useState } from "react";
import { bookingCurrency } from "../../../../../lib/currency";

export function CashReceived({ total }: { total: number }) {
  const resultId = useId();
  const [amount, setAmount] = useState("");
  const normalized = amount.trim().replace(",", ".");
  const cents = /^\d{1,6}(\.\d{1,2})?$/.test(normalized) ? Math.round(Number(normalized) * 100) : null;
  const change = cents === null ? null : cents - total;
  const money = (value: number) => bookingCurrency.format(value / 100);
  return <>
    <div className="cash-payment">
      <div className="cash-payment-total"><span>Total a cobrar</span><strong>{money(total)}</strong></div>
      <label className="cash-payment-input">Valor recebido em dinheiro (R$)
        <input name="cash" inputMode="decimal" placeholder="0,00" aria-describedby={resultId}
          value={amount} onChange={(event) => setAmount(event.currentTarget.value)} required />
      </label>
      <div id={resultId} className="cash-payment-result" data-state={change === null ? "empty" : change < 0 ? "short" : "ready"} role="status">
        <span>{change !== null && change < 0 ? "Falta receber" : "Troco a devolver"}</span>
        <strong>{change === null ? "—" : money(Math.abs(change))}</strong>
        {change === 0 && <small>Valor exato recebido</small>}
      </div>
    </div>
    <button className="primary action-keep" name="method" value="cash" disabled={change === null || change < 0}>Confirmar recebimento em dinheiro</button>
  </>;
}
