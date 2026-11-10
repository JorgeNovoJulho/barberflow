"use client";

import { useId, useState } from "react";

export function PasswordField({ label, name, autoComplete, minLength = 8, maxLength = 72, disabled }: {
  label: string; name: string; autoComplete: string; minLength?: number; maxLength?: number | null; disabled?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="finance-password-field">
    <label htmlFor={id}>{label}</label>
    <div className="finance-password-input">
      <input id={id} name={name} type={visible ? "text" : "password"} required disabled={disabled}
        minLength={minLength} maxLength={maxLength ?? undefined} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} />
      <button className="secondary" type="button" disabled={disabled} aria-controls={id}
        aria-label={(visible ? "Ocultar " : "Mostrar ") + label.toLowerCase()}
        onClick={() => setVisible(!visible)}>{visible ? "Ocultar" : "Mostrar"}</button>
    </div>
  </div>;
}
