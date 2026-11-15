"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { bookingCurrency } from "../lib/currency";
import { showcasePix } from "../lib/pix";
import { CopyPix } from "./painel/[establishmentId]/assinatura/copy-pix";
import { SubmitButton } from "./auth/submit";

type Pix = Pick<Parameters<typeof showcasePix>[0], "pix_key" | "merchant" | "city">;
const methods = { pix: "Pix", debit: "Débito", credit: "Crédito", cash: "Dinheiro" };
type Method = keyof typeof methods;
const money = (amount: number) => bookingCurrency.format(amount / 100);

function cents(raw: string) {
  return /^\d{1,6}([,.]\d{1,2})?$/.test(raw.trim()) ? Math.round(Number(raw.trim().replace(",", ".")) * 100) : null;
}

export function SplitPayment({ total, id, pix, action }: {
  total: number; id: string; pix: Pix | null; action: (form: FormData) => Promise<void>;
}) {
  const [first, setFirst] = useState<Method>(pix ? "pix" : "debit");
  const [second, setSecond] = useState<Method>("cash");
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [qr, setQr] = useState<{ code: string; image: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const firstAmount = cents(amount);
  const valid = firstAmount !== null && firstAmount > 0 && firstAmount < total && first !== second;
  const remaining = firstAmount === null ? 0 : total - firstAmount;
  const cashAmount = first === "cash" ? firstAmount : second === "cash" ? remaining : null;
  const cashReceived = cents(received);
  const change = cashReceived === null || cashAmount === null ? null : cashReceived - cashAmount;
  const hasPix = first === "pix" || second === "pix";
  const code = pix && valid && hasPix ? showcasePix({ ...pix, id, total_cents: first === "pix" ? firstAmount : remaining }) : null;
  useEffect(() => {
    if (!code) return;
    let active = true;
    void QRCode.toDataURL(code, { margin: 4 }).then(image => {
      if (active) setQr({ code, image });
    }).catch(() => {
      if (active) setQr(null);
    });
    return () => { active = false; };
  }, [code]);

  function paymentDetails(method: Method, portion: number) {
    if (!valid) return null;
    if (method === "pix") return code && qr?.code === code && <div>
      <p>Pix de <strong>{money(portion)}</strong></p>
      <img className="payment-qr" src={qr.image} alt="QR Code Pix da parcela" width={240} height={240} />
      <CopyPix value={code} code />
    </div>;
    if (method !== "cash") return <p>Valor na maquininha ({methods[method]}) <strong>{money(portion)}</strong></p>;
    return <>
      <label>Valor recebido em dinheiro (R$)
        <input className="split-cash-received" data-empty={!received.trim()} name="cash" inputMode="decimal"
          value={received} onChange={event => setReceived(event.target.value)} required />
      </label>
      <p role="status">{change === null ? "Informe o valor recebido em dinheiro." : change < 0 ? "Falta receber " + money(-change) : "Troco a devolver " + money(change)}</p>
    </>;
  }

  const choices = Object.entries(methods).map(([key, label]) =>
    <option key={key} value={key} disabled={key === "pix" && !pix}>{label}</option>);
  return <details name="order-payment-method"><summary className="secondary finance-tab command-action payment-action" data-tone="purple">Combinar duas formas</summary>
    <form className="account-form" action={action} onChange={event => {
      if (!(event.target instanceof HTMLInputElement && event.target.name === "confirmed")) setConfirmed(false);
    }}>
      <fieldset className="checkout-item-group" data-tone="purple">
        <legend>Primeira forma</legend>
        <label>Forma de pagamento <select name="first_method" value={first} onChange={event => setFirst(event.target.value as Method)}>{choices}</select></label>
        <label>Valor da primeira parte (R$) <input name="first_amount" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} required /></label>
        {firstAmount !== null && paymentDetails(first, firstAmount)}
      </fieldset>
      <fieldset className="checkout-item-group" data-tone="teal">
        <legend>Segunda forma</legend>
        <label>Forma de pagamento <select name="second_method" value={second} onChange={event => setSecond(event.target.value as Method)}>{choices}</select></label>
        <p role="status">Valor da segunda parte <strong>{valid ? money(remaining) : "—"}</strong></p>
        {paymentDetails(second, remaining)}
      </fieldset>
      {first === second && <p>Escolha duas formas diferentes.</p>}
      {valid && <label><input type="checkbox" name="confirmed" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required /> Conferi o recebimento das duas partes.</label>}
      <SubmitButton tone="keep" disabled={!valid || !confirmed || (cashAmount !== null && (change === null || change < 0)) || (hasPix && (!code || qr?.code !== code))}>Confirmar os dois pagamentos</SubmitButton>
    </form>
  </details>;
}
