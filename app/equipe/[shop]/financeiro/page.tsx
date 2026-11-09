import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";

async function updateAccess(shop: string, operation: "setup" | "unlock" | "lock", form: FormData) {
  "use server";
  if (!isUuid(shop)) notFound();
  const path = `/equipe/${shop}/financeiro`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  if (operation === "lock") {
    const { error } = await supabase.rpc("barberflow_team_finance_lock", { shop });
    redirect(path + (error ? "?estado=falha" : ""));
  }
  const secret = String(form.get("secret") ?? "");
  const setup = operation === "setup";
  if (secret.length < 8 || Buffer.byteLength(secret) > 72 || (setup && secret !== form.get("confirmation"))) redirect(path + "?estado=invalido");
  const { data, error } = await supabase.rpc("barberflow_team_finance_unlock", { shop, secret, setup });
  redirect(path + (data === "unlocked" && !error ? "" : "?estado=" + (data === "blocked" ? "bloqueado" : error ? "falha" : "invalido")));
}

const messages: Record<string, string> = {
  invalido: "Confira a senha financeira e a confirmação.",
  bloqueado: "Muitas tentativas. Aguarde até 15 minutos.",
  falha: "Não foi possível atualizar o acesso financeiro.",
};

export default async function TeamFinance({ params, searchParams }: {
  params: Promise<{ shop: string }>; searchParams: Promise<{ estado?: string }>;
}) {
  const { shop } = await params;
  if (!isUuid(shop)) notFound();
  const path = `/equipe/${shop}/financeiro`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  const { data, error } = await supabase.rpc("barberflow_team_finance_status", { shop });
  if (error) throw new Error("Não foi possível consultar o acesso financeiro.");
  if (data === "denied") notFound();
  const { estado } = await searchParams;
  const setup = data === "setup";
  return <section className="container section">
    <Link href={`/equipe/${shop}`}>Voltar à equipe</Link>
    <h1>Financeiro e relatórios</h1>
    {estado && Object.hasOwn(messages, estado) && <p role="alert">{messages[estado]}</p>}
    {data === "unlocked" ? <>
      <nav className="account-links" aria-label="Relatórios financeiros">
        <Link className="secondary" href={path + "/relatorios"}>Relatório de caixa</Link>
        <Link className="secondary" href={path + "/desempenho"}>Desempenho</Link>
      </nav>
      <form className="account-links" action={updateAccess.bind(null, shop, "lock")}><SubmitButton>Bloquear financeiro</SubmitButton></form>
    </> : <form className="account-form card panel-form" action={updateAccess.bind(null, shop, setup ? "setup" : "unlock")}>
      <h2>{setup ? "Criar senha financeira pessoal" : "Desbloquear relatórios"}</h2>
      <p>O acesso é de consulta e fica desbloqueado por 15 minutos.</p>
      <label>Senha financeira <input name="secret" type="password" minLength={8} maxLength={72} required autoComplete={setup ? "new-password" : "current-password"} /></label>
      {setup && <label>Confirmar senha <input name="confirmation" type="password" minLength={8} maxLength={72} required autoComplete="new-password" /></label>}
      <SubmitButton>{setup ? "Criar senha e desbloquear" : "Desbloquear"}</SubmitButton>
    </form>}
  </section>;
}
