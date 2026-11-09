import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";

export async function reportAccess(shop: string, delegated: boolean, section: string) {
  if (!isUuid(shop)) notFound();
  const base = `/${delegated ? "equipe" : "painel"}/${shop}/financeiro`;
  const path = base + "/" + section;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  const [business, access] = await Promise.all([
    delegated ? supabase.rpc("barberflow_my_team_shops")
      : supabase.from("barberflow_establishments").select("name").eq("id", shop).maybeSingle(),
    supabase.rpc(delegated ? "barberflow_team_finance_status" : "barberflow_finance_status", { shop }),
  ]);
  if (business.error || access.error) throw new Error("Não foi possível carregar o acesso aos relatórios.");
  const name = delegated ? (business.data as { id: string; name: string }[] | null)?.find(({ id }) => id === shop)?.name
    : (business.data as { name: string } | null)?.name;
  if (!name || access.data === "denied") notFound();
  if (access.data !== "unlocked") redirect(base);
  return { supabase, base, path, name };
}
