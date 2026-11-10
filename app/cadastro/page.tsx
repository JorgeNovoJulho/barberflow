import Link from "next/link";
import { AccountForm, Email, Password } from "../auth/form";
import { accountKind } from "../../lib/account-role";
import { signUp, signUpGoogle } from "../auth/actions";
import { localPath, localTestSignup, policyLinks } from "../../lib/auth-path";

export default async function Page({ searchParams }: { searchParams: Promise<{ estado?: string; erro?: string; next?: string; tipo?: string }> }) {
  const params = await searchParams;
  const next = localPath(params.next);
  const policies = policyLinks();
  const testSignup = localTestSignup();
  const kind = accountKind(params.tipo);
  const choices = <nav className="account-kind" aria-label="Tipo de conta">
    <Link className="primary" aria-current={kind === "cliente" ? "page" : undefined} href={{ pathname: "/cadastro", query: { tipo: "cliente", next } }}>Sou cliente</Link>
    <Link className="primary" aria-current={kind === "barbearia" ? "page" : undefined} href={{ pathname: "/cadastro", query: { tipo: "barbearia", next } }}>Sou profissional</Link>
  </nav>;
  if (!kind) return <section className="container section"><div className="card account-card"><h1>Crie sua conta</h1><p>Escolha como você quer usar o BARBERFLOW.</p>{choices}<Link href="/login">Já tenho conta</Link></div></section>;
  const google = <form className="account-form" action={signUpGoogle.bind(null, kind)}>
    <input name="next" type="hidden" value={next} />
    {policies && <label className="accept"><input name="terms" type="checkbox" required /> <span>Aceito os <a href={policies.terms}>Termos de Uso</a> e a <a href={policies.privacy}>Política de Privacidade</a>.</span></label>}
    <button className="secondary" disabled={!policies && !testSignup}>Criar conta com Google</button>
  </form>;
  return <AccountForm before={choices} title="Crie sua conta" description="Escolha como você quer usar o BARBERFLOW." status={params.estado ?? params.erro} action={signUp} submit="Criar conta" next={next} disabled={!policies && !testSignup} links={<>{google}<Link href={{ pathname: "/login", query: { next } }}>Já tenho conta</Link></>}>
      <input type="hidden" name="account" value={kind} />
      <label>Nome completo <input name="name" autoComplete="name" required maxLength={120} /></label>
      <Email /><Password isNew />
      <p>Use pelo menos oito caracteres, com letras e números.</p>
      <Password isNew confirmation />
      {policies
        ? <label className="accept"><input name="terms" type="checkbox" required /> <span>Aceito os <a href={policies.terms}>Termos de Uso</a> e confirmo que li a <a href={policies.privacy}>Política de Privacidade</a>.</span></label>
        : <p>{testSignup ? "Ambiente local de teste. Use uma conta de teste." : "O cadastro será liberado quando os termos e a política de privacidade forem configurados."}</p>}
  </AccountForm>;
}
