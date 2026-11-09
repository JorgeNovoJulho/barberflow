"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["resumo", "Visão geral"], ["agenda", "Agenda"], ["clientes", "Clientes"],
  ["profissionais", "Profissionais"], ["servicos", "Serviços"], ["estoque", "Estoque"],
  ["financeiro", "Financeiro"], ["fidelidade", "Fidelidade"], ["publicacao", "Página pública"],
  ["assinatura", "Assinatura"],
] as const;

export function WorkspaceNav({ shop, name, unread }: { shop: string; name: string; unread: number }) {
  const pathname = usePathname();
  const base = `/painel/${shop}`;
  const current = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return <aside className="workspace-rail finance-print-hide">
    <div className="workspace-identity">
      <span className="workspace-monogram" aria-hidden="true">{name.trim().slice(0, 2).toUpperCase()}</span>
      <div><p>Painel do negócio</p><strong>{name}</strong></div>
    </div>
    <nav aria-label="Módulos do estabelecimento" className="workspace-modules">
      {links.map(([id, label]) => <Link key={id} href={`${base}/${id}`}
        aria-current={current(`${base}/${id}`) ? "page" : undefined}>{label}</Link>)}
    </nav>
    <Link className="workspace-notices" href={`${base}/resumo?notificacoes=1#notificacoes`}>
      Notificações{unread > 0 && <span aria-label={`${unread} não lidas`}>{unread}</span>}
    </Link>
  </aside>;
}
