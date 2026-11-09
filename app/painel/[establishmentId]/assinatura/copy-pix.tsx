"use client";

import { useState } from "react";

export function CopyPix({ value }: { value: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Chave copiada.");
    } catch {
      setStatus("Selecione e copie a chave exibida.");
    }
  }
  return <><button className="secondary" type="button" onClick={copy}>Copiar chave Pix</button><span role="status"> {status}</span></>;
}
