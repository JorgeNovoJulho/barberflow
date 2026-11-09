"use client";

import { useState, useTransition } from "react";
import { themes, type ThemeId } from "../../lib/themes";
import { saveTheme } from "./actions";

export function ThemePicker({ initialTheme }: { initialTheme: ThemeId }) {
  const [saved, setSaved] = useState(initialTheme);
  const [selected, setSelected] = useState(initialTheme);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const changed = selected !== saved;
  const selectedLabel = themes.find(({ id }) => id === selected)?.label;

  function preview(id: ThemeId) {
    setSelected(id);
    setStatus("");
    document.documentElement.dataset.theme = id;
  }

  return <>
    <fieldset className="theme-options" disabled={pending}>
      <legend>Temas disponíveis</legend>
      {themes.map(({ id, label, color }) => <label key={id} className="theme-option">
        <input type="radio" name="theme" checked={selected === id} onChange={() => preview(id)} />
        <span className="theme-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
        {label}
      </label>)}
    </fieldset>
    <div className="theme-preview" aria-labelledby="theme-preview-title">
      <div>
        <p className="eyebrow">Prévia em tempo real</p>
        <h3 id="theme-preview-title">{selectedLabel}</h3>
        <p>A cor aparece nos destaques, botões e superfícies da plataforma.</p>
      </div>
      <span className="primary">Cor dos botões</span>
    </div>
    <div className="account-links">
      <button type="button" className="primary" disabled={pending || !changed} onClick={() => {
        startTransition(async () => {
          try {
            if (await saveTheme(selected)) {
              setSaved(selected);
              setStatus("Tema salvo na sua conta.");
              return;
            }
          } catch {
            // The preview stays available so the user can retry.
          }
          setStatus("Não foi possível salvar o tema. Tente novamente.");
        });
      }}>{pending ? "Salvando…" : "Salvar tema"}</button>
      <button type="button" disabled={pending || !changed} onClick={() => preview(saved)}>Restaurar tema salvo</button>
    </div>
    <p className="theme-status" role="status">{pending ? "Salvando a preferência na sua conta…" : status || (changed ? "Prévia ativa. Salve para manter a alteração." : "Tema atual salvo na conta.")}</p>
  </>;
}
