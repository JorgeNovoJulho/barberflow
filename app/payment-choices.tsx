"use client";

import { useRef, useState, type ReactNode } from "react";

export function PaymentChoices({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [showNotice, setShowNotice] = useState(false);
  const options = useRef<HTMLDivElement>(null);

  return <>
    <div key={version} ref={options}>{children}</div>
    <button type="button" className="secondary finance-tab" data-tone="blue" onClick={() => {
      setVersion(current => current + 1);
      setShowNotice(true);
      requestAnimationFrame(() => options.current?.querySelector("summary")?.focus());
    }}>Alterar forma de pagamento</button>
    {showNotice && <p role="status">Escolha outra forma ou combine duas. Se já compartilhou um QR Code Pix, confira se foi pago antes de mudar.</p>}
  </>;
}
