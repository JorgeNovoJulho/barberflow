"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, disabled, name, value }: { children: string; disabled?: boolean; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return <button className="primary" type="submit" name={name} value={value} disabled={disabled || pending} aria-busy={pending}>
    {pending ? "Aguarde…" : children}
  </button>;
}
