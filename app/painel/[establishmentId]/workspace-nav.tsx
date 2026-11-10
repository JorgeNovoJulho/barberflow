"use client";

import { signOut } from "../../auth/actions";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

const links = [
  ["resumo", "Visão geral"], ["agenda", "Agenda"], ["clientes", "Clientes"],
  ["profissionais", "Profissionais"], ["servicos", "Serviços"], ["estoque", "Estoque"],
  ["financeiro", "Financeiro"], ["fidelidade", "Fidelidade"], ["publicacao", "Página pública"],
  ["assinatura", "Assinatura"],
] as const;

const icons = {
  resumo: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  agenda: "M4 5h16v15H4zM4 9h16M8 3v4m8-4v4M8 14h3m2 0h3",
  clientes: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m7 3a4 4 0 0 1 3 4v3",
  profissionais: "M3 7h18v13H3zM8 7V4h8v3M3 12h18m-11 0v2h4v-2",
  servicos: "M4 5h16M4 12h16M4 19h16M8 3v4m8 3v4m-6 3v4",
  estoque: "m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v10",
  financeiro: "M4 20h16M6 16v-4m6 4V8m6 8V4",
  fidelidade: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z",
  publicacao: "M4 5h16v14H4zM4 9h16m-8 6 4-3m-4 0h4v4",
  assinatura: "M3 6h18v12H3zM3 10h18M6 14h5",
} satisfies Record<(typeof links)[number][0], string>;

export function WorkspaceNav({ shop, name, image, unread, paidOrders }: { shop: string; name: string; image?: string; unread: number; paidOrders?: number }) {
  const [failedImage, setFailedImage] = useState<string>();
  const pathname = usePathname();
  const base = `/painel/${shop}`;
  const current = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return <aside className="workspace-rail finance-print-hide">
    <div className="workspace-identity">
      <span className="workspace-monogram" aria-hidden="true">{image && image !== failedImage ? <img src={image} alt="" onError={() => setFailedImage(image)} /> : name.trim().slice(0, 2).toUpperCase()}</span>
      <div><p>Painel do negócio</p><strong>{name}</strong></div>
    </div>
    <nav aria-label="Módulos do estabelecimento" className="workspace-modules">
      {links.map(([id, label]) => <Link key={id} href={`${base}/${id}`}
        aria-current={current(`${base}/${id}`) ? "page" : undefined}>
        <svg className="workspace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[id]} /></svg>
        {label}
      </Link>)}
    </nav>
    {paidOrders !== undefined && <Link className="workspace-notices" href={base + "/publicacao#publicar-no-feed"}>Publicar no feed</Link>}
    {paidOrders !== undefined && <Link className="workspace-notices" href={base + "/vitrine"} aria-current={current(base + "/vitrine") ? "page" : undefined}>
      Pedidos da vitrine{paidOrders > 0 && <span aria-label={paidOrders + " novos pagamentos"}>{paidOrders}</span>}
    </Link>}
    <Link className="workspace-notices" href={`${base}/resumo?notificacoes=1#notificacoes`}>
      Notificações{unread > 0 && <span aria-label={`${unread} não lidas`}>{unread}</span>}
    </Link>
    <form action={signOut}><button className="workspace-notices">Sair do sistema</button></form>
  </aside>;
}
