import Link from "next/link";
import { supabaseServer } from "../../lib/supabase";

const tabs = [
  ["/gestao-master", "Landing Page"], ["/gestao-master/assinaturas", "Assinaturas"],
  ["/gestao-master/avaliacoes", "Moderação"], ["/gestao-master/usuarios", "Contas e Usuários"],
  ["/gestao-master/financeiro", "Financeiro"],
];

export async function MasterTabs({ current }: { current: string }) {
  const supabase = await supabaseServer();
  const pending = await supabase?.from("barberflow_subscription_charges")
    .select("id", { count: "exact", head: true }).eq("status", "submitted");
  return <nav className="master-tabs" aria-label="Administração master">
    {tabs.map(([url, label]) => <Link key={url} href={url} aria-current={current === url ? "page" : undefined}>{label}
      {url.endsWith("/assinaturas") && !!pending?.count && <span className="master-proof-count"
        aria-label={pending.count + " comprovantes em análise"}>{pending.count}</span>}
    </Link>)}
  </nav>;
}

export function MasterCards({ items }: { items: [string, string | number][] }) {
  return <dl className="master-cards">
    {items.map(([label, value]) => <div key={label} className="card"><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

export function reportPage(value: string | undefined) {
  return /^\d{1,5}$/.test(value ?? "") ? Number(value) : 0;
}

export function MasterPagination({ page, total, search }: { page: number; total: number; search: string }) {
  const query = (index: number) => "?" + new URLSearchParams({ busca: search, pagina: String(index) });
  return <nav className="account-links" aria-label="Paginação do relatório">
    {page > 0 && <Link href={query(page - 1)}>Anterior</Link>}
    <span>Página {page + 1}</span>
    {(page + 1) * 25 < total && <Link href={query(page + 1)}>Próxima</Link>}
  </nav>;
}

export function masterDate(value: string | null) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
