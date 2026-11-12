import type { User } from "@supabase/supabase-js";
import { isMasterAccount, masterPath } from "./master";
import type { supabaseServer } from "./supabase";

export function accountKind(value: unknown) {
  return value === "cliente" || value === "barbearia" ? value : null;
}

export async function afterLogin(client: NonNullable<Awaited<ReturnType<typeof supabaseServer>>>, user: User | null, next: string) {
  if (await isMasterAccount(client, user?.email)) return masterPath;
  if (user?.app_metadata.barberflow_managed_professional === true) {
    const { data } = await client.rpc("barberflow_managed_professional_destination");
    if (typeof data === "string") return `/equipe/${data}/meu-painel`;
    await client.auth.signOut({ scope: "local" });
    return "/login?estado=credenciais";
  }
  const role = await client.rpc("barberflow_account_kind");
  if (/^\/estabelecimento\/[a-z0-9-]+\/agendar(?:\?|$)/.test(next) || /^\/minhas-compras(?:\?|$)/.test(next)) return next;
  if (role.data === "cliente") return "/cliente";
  if (role.data === "barbearia" && next.startsWith("/convite-equipe/")) return next;
  if (role.data === "barbearia") {
    const { data } = await client.from("barberflow_establishments").select("id").eq("owner_id", user?.id ?? "").order("name").order("id").limit(2);
    return data?.length === 1 ? `/painel/${data[0].id}/resumo` : "/painel";
  }
  return next;
}
