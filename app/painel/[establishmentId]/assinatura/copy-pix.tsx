"use client";

import { useState } from "react";

export function CopyPix({ value, code = false }: { value: string; code?: boolean }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(code ? "Código Pix copiado." : "Chave copiada.");
    } catch {
      setStatus(code ? "Selecione e copie o código exibido." : "Selecione e copie a chave exibida.");
    }
  }
  return <><button className="secondary" type="button" onClick={copy}>{code ? "Copiar código Pix" : "Copiar chave Pix"}</button><span role="status"> {status}</span></>;
}
