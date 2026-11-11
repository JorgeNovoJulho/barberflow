import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasMasterSession, masterPath } from "../../lib/master";
import { AccountForm, Email, Password } from "../auth/form";
import { resendConfirmation, signIn } from "../auth/actions";
import { SubmitButton } from "../auth/submit";
import { localPath } from "../../lib/auth-path";

export default async function Page({ searchParams }: { searchParams: Promise<{ estado?: string; erro?: string; next?: string }> }) {
  if (await hasMasterSession()) redirect(masterPath);
  const params = await searchParams;
  const pendingEmail = params.estado === "email_pendente" ? (await cookies()).get("bf_pending_email")?.value : undefined;
  const next = localPath(params.next);
  return <AccountForm title="Entrar" description="Acesse sua conta TOP BARBER." status={params.estado ?? params.erro} notice={pendingEmail && <>E-mail cadastrado: <strong>{pendingEmail}</strong>.</>} action={signIn} submit="Entrar" next={next} links={<><Link href="/recuperar-senha">Esqueci minha senha</Link><Link href={{ pathname: "/cadastro", query: { next } }}>Criar conta</Link>
    <details>
      <summary>Reenviar confirmação de e-mail</summary>
      <form className="account-form" action={resendConfirmation}>
        <input type="hidden" name="next" value={next} />
        <Email />
        <SubmitButton>Enviar novo link</SubmitButton>
      </form>
    </details></>}>
      <Email /><Password />
  </AccountForm>;
}
