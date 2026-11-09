"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authOrigin } from "../../../../lib/auth-path";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";

export type InviteResult = { link?: string; error?: string };

export async function createTeamInvite(shop: string, _previous: InviteResult, form: FormData): Promise<InviteResult> {
  const supabase = await supabaseServer();
  if (!isUuid(shop) || !supabase || !(await supabase.auth.getUser()).data.user) return { error: "Entre novamente para gerar o convite." };
  const email = String(form.get("email") ?? "").trim();
  const professional = String(form.get("professional") ?? "");
  const see_agendas = form.get("see_all") === "on";
  const manage_agendas = form.get("manage_all") === "on";
  const edit_clients = form.get("manage_clients") === "on";
  const edit_services = form.get("manage_services") === "on";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (professional && !isUuid(professional)) || (!professional && !see_agendas && !manage_agendas && !edit_clients && !edit_services)) {
    return { error: "Informe um e-mail e vincule uma agenda ou selecione uma permissão." };
  }
  const { data, error } = await supabase.rpc("barberflow_invite_team", { shop, invite_email: email, professional: professional || null, see_agendas, manage_agendas, edit_clients, edit_services });
  if (error || typeof data !== "string") return { error: "Não foi possível gerar o convite. Confira se já existe um acesso ativo para este e-mail." };
  revalidatePath(`/painel/${shop}/profissionais`);
  return { link: new URL(`/convite-equipe/${data}`, authOrigin()).href };
}

export async function revokeTeamAccess(shop: string, member: string) {
  if (!isUuid(shop) || !isUuid(member)) redirect("/painel");
  const path = `/painel/${shop}/profissionais`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  const { data, error } = await supabase.rpc("barberflow_revoke_team", { shop, member });
  revalidatePath(path);
  redirect(path + "?estado=" + (data && !error ? "acesso-revogado" : "falha"));
}
