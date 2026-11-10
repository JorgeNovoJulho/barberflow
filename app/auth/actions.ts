"use server";

import { redirect } from "next/navigation";
import { authOrigin, localPath, localTestSignup, policyLinks } from "../../lib/auth-path";
import { isMasterAccount, masterPath } from "../../lib/master";
import { supabaseServer } from "../../lib/supabase";

function value(data: FormData, name: string) {
  return String(data.get(name) ?? "");
}

function callback(next: string) {
  const url = new URL("/auth/callback", authOrigin());
  url.searchParams.set("next", next);
  return url.toString();
}

function login(next: string, status: string): never {
  redirect("/login?" + new URLSearchParams({ next, estado: status }));
}

export async function signIn(data: FormData) {
  const next = localPath(data.get("next"));
  const supabase = await supabaseServer();
  if (!supabase) login(next, "indisponivel");
  const { data: result, error } = await supabase.auth.signInWithPassword({
    email: value(data, "email").trim(),
    password: value(data, "password"),
  });
  if (error?.code === "email_not_confirmed") login(next, "email_pendente");
  if (error?.status === 429) login(next, "limite");
  if (error) login(next, "credenciais");
  redirect(await isMasterAccount(supabase, result.user?.email) ? masterPath : next);
}

export async function signUp(data: FormData) {
  const next = localPath(data.get("next"));
  const password = value(data, "password");
  const name = value(data, "name").trim();
  const account = value(data, "account");
  const back = (status: string): never => redirect("/cadastro?" + new URLSearchParams({ next, estado: status }));
  const policies = policyLinks();
  if (!policies && !localTestSignup()) return back("indisponivel");
  if (!name || !["barbearia", "cliente"].includes(account) || (policies && value(data, "terms") !== "on")) return back("campos");
  if (!validPassword(password)) return back("invalido");
  if (password !== value(data, "confirmation")) return back("senhas");
  const supabase = await supabaseServer();
  if (!supabase) return back("indisponivel");
  const { data: result, error } = await supabase.auth.signUp({
    email: value(data, "email").trim(),
    password,
    options: {
      data: { full_name: name, account_intent: account },
      emailRedirectTo: callback(next),
    },
  });
  if (error?.status === 429) return back("limite");
  if (error?.code === "weak_password") return back("invalido");
  if (error?.code === "user_already_exists") login(next, "confirmar");
  if (error) return back("falha");
  if (result.session) redirect(await isMasterAccount(supabase, result.user?.email) ? masterPath : next);
  login(next, "confirmar");
}

export async function resendConfirmation(data: FormData) {
  const next = localPath(data.get("next"));
  const supabase = await supabaseServer();
  if (!supabase) login(next, "indisponivel");
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: value(data, "email").trim(),
    options: { emailRedirectTo: callback(next) },
  });
  if (error?.status === 429) login(next, "limite");
  if (error) login(next, "reenvio_falhou");
  login(next, "reenviado");
}

export async function requestReset(data: FormData) {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/recuperar-senha?estado=indisponivel");
  await supabase.auth.resetPasswordForEmail(value(data, "email").trim(), { redirectTo: callback("/nova-senha") });
  redirect("/recuperar-senha?estado=enviado");
}

function validPassword(password: string) {
  return password.length >= 8 && /\p{L}/u.test(password) && /\d/.test(password);
}

export async function updatePassword(data: FormData) {
  const password = value(data, "password");
  if (!validPassword(password) || password !== value(data, "confirmation")) redirect("/nova-senha?estado=invalido");
  const supabase = await supabaseServer();
  if (!supabase) redirect("/nova-senha?estado=indisponivel");
  const { data: result, error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/nova-senha?estado=falha");
  redirect(await isMasterAccount(supabase, result.user?.email) ? masterPath : "/configuracoes");
}

export async function signOut() {
  const supabase = await supabaseServer();
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
