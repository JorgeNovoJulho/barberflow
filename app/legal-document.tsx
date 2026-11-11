import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { legalIdentity } from "../lib/auth-path";

export function LegalDocument({ title, children }: { title: string; children: ReactNode }) {
  const identity = legalIdentity();
  if (!identity) notFound();
  const { operator, email, registration } = identity;

  return <article className="container section legal-document">
    <p className="eyebrow">TOP BARBER</p>
    <h1>{title}</h1>
    <p>Responsável pela plataforma: {operator}{registration && <> · CNPJ {registration}</>}.</p>
    <p>Contato: <a href={`mailto:${email}`}>{email}</a>.</p>
    {children}
    <p><Link href="/cadastro">Voltar ao cadastro</Link></p>
  </article>;
}
