import { createHash } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { professionalAuthAdmin } from "../../../lib/professional-auth";

const tokenPattern = /^[a-f0-9]{64}$/;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

async function register(token: string, form: FormData) {
  "use server";
  const admin = professionalAuthAdmin();
  if (!admin || !tokenPattern.test(token)) notFound();
  const full_name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const path = "/convite-divulgador/" + token;
  if (!full_name || full_name.length > 120 || password.length < 10 || password !== form.get("confirmation")) redirect(path + "?erro=1");
  const { error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name, account_intent: "barbearia" },
    app_metadata: { barberflow_promoter: true, barberflow_promoter_invite: digest(token) },
  });
  if (error) redirect(path + "?erro=1");
  redirect("/login");
}

export default async function Page({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ erro?: string }>;
}) {
  const { token } = await params;
  const admin = professionalAuthAdmin();
  if (!admin || !tokenPattern.test(token)) notFound();
  const { data } = await admin.rpc("barberflow_promoter_invite_valid", { digest_hex: digest(token) });
  if (!data) notFound();
  const { erro } = await searchParams;
  return <section className="container section"><form className="card account-form panel-form" action={register.bind(null, token)}>
    <h1>Cadastro de divulgador</h1>
    {erro && <p role="alert">Não foi possível criar a conta. Confira os campos e tente novamente.</p>}
    <label>Nome <input name="name" required maxLength={120} autoComplete="name" /></label>
    <label>E-mail <input name="email" type="email" required autoComplete="email" /></label>
    <label>Senha <input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
    <label>Confirmar senha <input name="confirmation" type="password" required minLength={10} autoComplete="new-password" /></label>
    <button className="primary">Criar conta</button>
  </form></section>;
}
