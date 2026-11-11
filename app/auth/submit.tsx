"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, disabled, name, value, tone }: { children: string; disabled?: boolean; name?: string; value?: string; tone?: "keep" | "cancel" }) {
  const { pending } = useFormStatus();
  return <button className={tone ? "primary action-" + tone : "primary"} type="submit" name={name} value={value} disabled={disabled || pending} aria-busy={pending}>
    {pending ? "Aguarde…" : children}
  </button>;
}
