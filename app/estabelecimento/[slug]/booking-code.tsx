"use client";

import { useState } from "react";

export function BookingCode({ code }: { code: string }) {
  const [status, setStatus] = useState("");
  return <div className="account-form">
    <label>Código da reserva
      <input readOnly value={code} onFocus={(event) => event.currentTarget.select()} />
    </label>
    <button className="secondary" type="button" onClick={async () => {
      try {
        await navigator.clipboard.writeText(code);
        setStatus("Código copiado.");
      } catch {
        setStatus("Toque no campo do código para selecioná-lo e copiar manualmente.");
      }
    }}>Copiar código da reserva</button>
    {status && <p role="status">{status}</p>}
  </div>;
}
