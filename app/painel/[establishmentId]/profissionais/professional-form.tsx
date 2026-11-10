"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { saveProfessional } from "./actions";

export function ProfessionalSubmission({ shop, professional, delegated, children }: {
  shop: string; professional: string | null; delegated: boolean; children: ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const message = await saveProfessional(shop, professional, delegated, form);
      if (typeof message === "string") setError(message);
      else window.location.assign(message.location);
    } catch {
      setError("Não foi possível enviar o formulário. Confira sua conexão e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="account-form" onSubmit={submit}>
    {children}
    <button className="primary" type="submit" disabled={saving} aria-busy={saving}>
      {saving ? "Salvando…" : "Salvar profissional"}
    </button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
