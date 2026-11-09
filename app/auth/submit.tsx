"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, disabled }: { children: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className="primary" type="submit" disabled={disabled || pending} aria-busy={pending}>
    {pending ? "Aguarde…" : children}
  </button>;
}
