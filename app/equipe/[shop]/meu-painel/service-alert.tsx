"use client";

import { useId, useRef } from "react";

export function ServiceAlert({ label, className, registration }: {
  label: string; className?: string; registration?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  return <>
    <button type="button" className={className} onClick={() => dialog.current?.showModal()}>{label}</button>
    <dialog className="professional-service-alert card" ref={dialog} aria-labelledby={title}>
      <h2 id={title}>{registration ? "Nenhum serviço cadastrado" : "Nenhum serviço vinculado"}</h2>
      {registration
        ? <p>A loja não tem serviços ativos cadastrados e seu perfil não está vinculado a nenhum. Para continuar, cadastre um serviço e vincule seu perfil a ele.</p>
        : <p>A loja tem serviços ativos. Peça ao administrador da loja para vincular pelo menos um serviço ao seu perfil.</p>}
      <form method="dialog" className="account-links">
        {registration && <a className="primary" href={registration}>Cadastrar serviço</a>}
        <button className="secondary" autoFocus>Fechar</button>
      </form>
    </dialog>
  </>;
}
