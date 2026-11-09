"use client";

import { useState } from "react";

export function CopyPix({ value, code = false, link = false }: { value: string; code?: boolean; link?: boolean }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(link ? "Link copiado." : code ? "Código Pix copiado." : "Chave copiada.");
    } catch {
      setStatus(link ? "Abra o checkout e copie o endereço." : code ? "Selecione e copie o código exibido." : "Selecione e copie a chave exibida.");
    }
  }
  return <><button className="secondary" type="button" onClick={copy}>{link ? "Copiar link de cartão" : code ? "Copiar código Pix" : "Copiar chave Pix"}</button><span role="status"> {status}</span></>;
}
