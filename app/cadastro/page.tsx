import Link from "next/link";
import { AccountForm, Email, Password } from "../auth/form";
import { signUp } from "../auth/actions";
import { localPath, localTestSignup, policyLinks } from "../../lib/auth-path";

export default async function Page({ searchParams }: { searchParams: Promise<{ estado?: string; erro?: string; next?: string }> }) {
  const params = await searchParams;
  const next = localPath(params.next);
  const policies = policyLinks();
  const testSignup = localTestSignup();
  return <AccountForm title="Crie sua conta" description="Escolha como você quer usar o BARBERFLOW." status={params.estado ?? params.erro} action={signUp} submit="Criar conta" next={next} disabled={!policies && !testSignup} links={<Link href={{ pathname: "/login", query: { next } }}>Já tenho conta</Link>}>
      <fieldset><legend>Tipo de conta</legend><label><input name="account" type="radio" value="barbearia" defaultChecked /> Sou profissional ou tenho um negócio</label><label><input name="account" type="radio" value="cliente" /> Quero agendar um atendimento</label></fieldset>
      <label>Nome completo <input name="name" autoComplete="name" required maxLength={120} /></label>
      <Email /><Password isNew />
      <p>Use pelo menos oito caracteres, com letras e números.</p>
      <Password isNew confirmation />
      {policies
        ? <label className="accept"><input name="terms" type="checkbox" required /> <span>Li e aceito os <a href={policies.terms}>Termos de uso</a> e a <a href={policies.privacy}>Política de privacidade</a>.</span></label>
        : <p>{testSignup ? "Ambiente local de teste. Use uma conta de teste." : "O cadastro será liberado quando os termos e a política de privacidade forem configurados."}</p>}
  </AccountForm>;
}
