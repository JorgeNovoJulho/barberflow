"use client";

import { useRef, useState } from "react";

export function ProfessionalCredentials({ login }: { login?: string }) {
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState("");
  const confirmation = useRef<HTMLInputElement>(null);
  return <fieldset>
    <legend>Acesso ao painel profissional</legend>
    <label>Login <input readOnly value={login ?? ""} placeholder="Gerado automaticamente ao salvar" /></label>
    <label>{login ? "Nova senha" : "Senha"} <input name="professional_password" type={visible ? "text" : "password"}
      autoComplete="new-password" minLength={10} maxLength={72} value={password} onChange={(event) => {
        const next = event.target.value;
        setPassword(next);
        const field = confirmation.current;
        field?.setCustomValidity(field.value && field.value !== next ? "As senhas precisam ser iguais." : "");
      }} /></label>
    <label>Confirmar senha <input name="professional_password_confirmation" type={visible ? "text" : "password"}
      autoComplete="new-password" required={Boolean(password)} minLength={10} maxLength={72} ref={confirmation}
      onChange={(event) => {
        event.target.setCustomValidity(event.target.value === password ? "" : "As senhas precisam ser iguais.");
      }}
      onFocus={(event) => event.target.setCustomValidity(event.target.value && event.target.value !== password ? "As senhas precisam ser iguais." : "")} /></label>
    <button className="secondary" type="button" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Ocultar senhas" : "Mostrar senhas"}</button>
    <p>Use pelo menos 10 caracteres. Deixe os campos vazios para salvar apenas o perfil.</p>
  </fieldset>;
}
