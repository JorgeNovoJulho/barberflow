"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "../../../auth/submit";
import { resetFinanceWithEmail } from "./actions";
import { PasswordField } from "./password-field";

export function FinanceEmailResetForm({ shop, sale }: { shop: string; sale: string | null }) {
  const [error, submit, pending] = useActionState(resetFinanceWithEmail.bind(null, shop), null);
  const feedback = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!pending && error) feedback.current?.focus();
  }, [error, pending]);

  return (
    <form className="account-form" action={submit} noValidate>
      {sale && <input type="hidden" name="comanda" value={sale} />}
      <h3>Crie uma nova senha financeira</h3>
      <p>Use pelo menos 8 caracteres e escolha uma senha diferente da que você usa para entrar no BARBERFLOW.</p>
      <PasswordField label="Nova senha financeira" name="new_secret" autoComplete="new-password" />
      <PasswordField label="Confirmar nova senha financeira" name="confirmation" autoComplete="new-password" />
      {error && !pending && <p ref={feedback} role="alert" tabIndex={-1}>{error}</p>}
      <SubmitButton>Salvar senha e entrar no Financeiro</SubmitButton>
    </form>
  );
}
