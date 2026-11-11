"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, disabled, name, value, tone, icon, className }: { children: string; disabled?: boolean; name?: string; value?: string; tone?: "keep" | "cancel"; icon?: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={["primary", tone && "action-" + tone, className].filter(Boolean).join(" ")} type="submit" name={name} value={value} disabled={disabled || pending} aria-busy={pending}>
    {icon}
    {pending ? "Aguarde…" : children}
  </button>;
}
