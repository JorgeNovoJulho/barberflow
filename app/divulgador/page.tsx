import Link from "next/link";
import { CopyPix } from "../painel/[establishmentId]/assinatura/copy-pix";
import { randomBytes } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { authOrigin } from "../../lib/auth-path";
import { supabaseServer } from "../../lib/supabase";

async function saveProfile(form: FormData) {
  "use server";
  const client = await supabaseServer();
  const pix = String(form.get("pix") ?? "").trim();
  const { data, error } = await client?.rpc("barberflow_promoter_profile", form.get("generate")
    ? { new_code: randomBytes(6).toString("hex").toUpperCase() }
    : { new_pix: pix.slice(0, 78) }) ?? {};
  redirect(data && !error ? "/divulgador?salvo=1" : "/divulgador?erro=1");
}

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; salvo?: string }> }) {
  const client = await supabaseServer();
  if (!client || !(await client.auth.getUser()).data.user) redirect("/login");
  const { data } = await client.rpc("barberflow_promoter_access");
  if (!data) notFound();
  const { data: profile } = await client.rpc("barberflow_promoter_profile");
  const { erro, salvo } = await searchParams;
  return <section className="container section"><h1>Meu painel de divulgador</h1><Link href="/painel">Meus estabelecimentos</Link>
    {profile?.trial_until && <p>Período inicial até {new Date(profile.trial_until).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</p>}
    {erro && <p role="alert">Não foi possível salvar. Confira os dados.</p>}
    {salvo && <p role="status">Alteração salva.</p>}
    <form className="card account-form panel-form" action={saveProfile}>
      <label>Chave Pix <input name="pix" defaultValue={profile?.pix ?? ""} maxLength={77} required /></label>
      <button className="primary">Salvar chave Pix</button>
    </form>
    <section className="card panel-form"><h2>Meu link de divulgador</h2>
      {profile?.code ? <CopyPix link value={new URL("/cadastro?ref=" + profile.code, authOrigin()).href} />
        : <form action={saveProfile}><button className="primary" name="generate" value="1">Gerar link exclusivo</button></form>}
      <p>{profile?.referrals ?? 0} cadastrados · {profile?.paid ?? 0} pagantes</p>
    </section>
    <section className="card panel-form"><h2>Comissões</h2>
      {profile?.commissions?.length ? <ul>{profile.commissions.map((entry: { amount: number; date: string; paid: boolean }, index: number) =>
        <li key={index}>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(entry.amount / 100)} · {entry.paid ? "Paga" : "Pendente"}</li>)}</ul> : <p>Nenhuma comissão registrada.</p>}
    </section>
  </section>;
}
