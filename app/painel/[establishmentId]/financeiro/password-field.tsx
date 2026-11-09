"use client";

import { useId, useState } from "react";

export function PasswordField({ label, name, autoComplete, minLength = 8 }: {
  label: string; name: string; autoComplete: string; minLength?: number;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="finance-password-field">
    <label htmlFor={id}>{label}</label>
    <div className="finance-password-input">
      <input id={id} name={name} type={visible ? "text" : "password"} required
        minLength={minLength} maxLength={72} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} />
      <button className="secondary" type="button" aria-controls={id}
        aria-label={(visible ? "Ocultar " : "Mostrar ") + label.toLowerCase()}
        onClick={() => setVisible(!visible)}>{visible ? "Ocultar" : "Mostrar"}</button>
    </div>
  </div>;
}
