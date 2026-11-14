"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt(): Promise<unknown> };

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt>();
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const check = () => setInstalled(standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const complete = () => {
      setInstalled(true);
      setPrompt(undefined);
    };
    check();
    standalone.addEventListener("change", check);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    return () => {
      standalone.removeEventListener("change", check);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);
  return <section className="card">
    <h2>Instalar aplicativo</h2>
    {installed ? <p role="status">O TOP BARBER está instalado.</p> : <>
      {prompt && <button className="primary" type="button" onClick={() => {
        setPrompt(undefined);
        void prompt.prompt().catch(() => {});
      }}>Instalar TOP BARBER</button>}
      <details open={!prompt}>
        <summary>Como instalar pelo navegador</summary>
        <ul>
          <li>No Chrome ou Edge, abra o menu do navegador e escolha Instalar aplicativo ou Adicionar à tela inicial.</li>
          <li>No iPhone ou iPad, abra no Safari e toque em Compartilhar → Adicionar à Tela de Início.</li>
          <li>No Safari do Mac, use Arquivo → Adicionar ao Dock, quando disponível.</li>
        </ul>
      </details>
    </>}
  </section>;
}
