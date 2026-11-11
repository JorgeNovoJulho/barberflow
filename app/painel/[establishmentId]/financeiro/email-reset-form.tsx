"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "../../../auth/submit";
import { resetFinanceWithEmail } from "./actions";
import { PasswordField } from "./password-field";

export function FinanceEmailResetForm({ shop, sale }: { shop: string; sale: string | null }) {
  const [result, submit, pending] = useActionState(resetFinanceWithEmail.bind(null, shop), null);
  const error = typeof result === "string" ? result : null;
  const next = result && typeof result !== "string" ? result.next : null;
  const feedback = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (pending) return;
    if (next) window.location.replace(next);
    else if (error) feedback.current?.focus();
  }, [error, next, pending]);

  return (
    <form className="account-form" action={submit} noValidate>
      {sale && <input type="hidden" name="comanda" value={sale} />}
      <h3>Crie uma nova senha financeira</h3>
      <p>Use pelo menos 8 caracteres e escolha uma senha diferente da que você usa para entrar no TOP BARBER.</p>
      <PasswordField label="Nova senha financeira" name="new_secret" autoComplete="new-password" />
      <PasswordField label="Confirmar nova senha financeira" name="confirmation" autoComplete="new-password" />
      {error && !pending && <p ref={feedback} role="alert" tabIndex={-1}>{error}</p>}
      {next && <p role="status" data-feedback="success">Senha financeira alterada. Abrindo o Financeiro… <a href={next}>Entrar no Financeiro</a></p>}
      <SubmitButton disabled={!!next}>Salvar senha e entrar no Financeiro</SubmitButton>
    </form>
  );
}
