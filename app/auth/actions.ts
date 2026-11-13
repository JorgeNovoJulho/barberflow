"use server";
import { professionalAuthAdmin } from "../../lib/professional-auth";

import { cookies } from "next/headers";
import { accountKind, afterLogin } from "../../lib/account-role";
import { redirect } from "next/navigation";
import { authOrigin, localPath, localTestSignup, policyLinks } from "../../lib/auth-path";
import { isMasterAccount, masterPath } from "../../lib/master";
import { supabaseConfig, supabaseServer } from "../../lib/supabase";

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
  const email = value(data, "email").trim();
  let authEmail = email;
  if (/^[a-z0-9]+@[a-z0-9]+\.topbarberflow\.com\.br$/i.test(email)) {
    const admin = professionalAuthAdmin();
    if (!admin) login(next, "indisponivel");
    const { data: address, error } = await admin.rpc("barberflow_resolve_professional_login", { address: email });
    if (error) login(next, "indisponivel");
    if (typeof address === "string") authEmail = address;
  }
  const jar = await cookies();
  jar.delete("bf_pending_email");
  const { data: result, error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: value(data, "password"),
  });
  if (error?.code === "email_not_confirmed") {
    jar.set("bf_pending_email", email.slice(0, 254), { httpOnly: true, sameSite: "lax", secure: authOrigin().startsWith("https:"), path: "/", maxAge: 120 });
    login(next, "email_pendente");
  }
  if (error?.status === 429) login(next, "limite");
  if (error) login(next, "credenciais");
  redirect(await afterLogin(supabase, result.user, next));
}

export async function signUp(data: FormData) {
  const next = localPath(data.get("next"));
  const password = value(data, "password");
  const name = value(data, "name").trim();
  const account = value(data, "account");
  const ref = value(data, "ref");
  const back = (status: string): never => redirect("/cadastro?" + new URLSearchParams({ next, estado: status, tipo: account, ref }));
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
      data: { full_name: name, account_intent: account, referral_code: /^[A-Z0-9]{12}$/.test(ref) ? ref : undefined },
      emailRedirectTo: callback(next),
    },
  });
  if (error?.status === 429) return back("limite");
  if (error?.code === "weak_password") return back("invalido");
  if (error?.code === "user_already_exists") login(next, "confirmar");
  if (error) return back("falha");
  if (result.session) redirect(await afterLogin(supabase, result.user, next));
  login(next, "confirmar");
}

export async function signUpGoogle(chosen: string, form: FormData) {
  const next = localPath(form.get("next"));
  const kind = accountKind(chosen);
  const back = "/cadastro?" + new URLSearchParams({ next, tipo: kind ?? "" });
  const policies = policyLinks();
  if (!kind) redirect(back + "&estado=campos");
  if (!policies && !localTestSignup()) redirect(back + "&estado=indisponivel");
  if (policies && form.get("terms") !== "on") redirect(back + "&estado=termos");
  const supabase = await supabaseServer();
  if (!supabase) redirect(back + "&estado=indisponivel");
  const config = supabaseConfig();
  if (!config) redirect(back + "&estado=indisponivel");
  const provider = await fetch(new URL("/auth/v1/settings", config.url), {
    headers: { apikey: config.key }, next: { revalidate: 60 },
  }).then(async response => response.ok ? (await response.json()).external?.google === true : null).catch(() => null);
  if (provider === false) redirect(back + "&estado=google_desativado");
  if (provider === null) redirect(back + "&estado=google");
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback(next), queryParams: { prompt: "select_account" } } });
  if (error || !data.url) redirect(back + "&estado=google");
  (await cookies()).set("bf_google_signup", kind, { httpOnly: true, sameSite: "lax", secure: authOrigin().startsWith("https:"), path: "/", maxAge: 600 });
  const referral = value(form, "ref");
  const jar = await cookies();
  jar.delete("bf_google_referral");
  if (/^[A-Z0-9]{12}$/.test(referral)) jar.set("bf_google_referral", referral, { httpOnly: true, sameSite: "lax", secure: authOrigin().startsWith("https:"), path: "/", maxAge: 600 });
  redirect(data.url);
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
