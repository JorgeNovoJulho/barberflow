import Link from "next/link";
import { AccountForm, Email, Password } from "../auth/form";
import { resendConfirmation, signIn } from "../auth/actions";
import { SubmitButton } from "../auth/submit";
import { localPath } from "../../lib/auth-path";

export default async function Page({ searchParams }: { searchParams: Promise<{ estado?: string; erro?: string; next?: string }> }) {
  const params = await searchParams;
  const next = localPath(params.next);
  return <AccountForm title="Entrar" description="Acesse sua conta BARBERFLOW." status={params.estado ?? params.erro} action={signIn} submit="Entrar" next={next} links={<><Link href="/recuperar-senha">Esqueci minha senha</Link><Link href={{ pathname: "/cadastro", query: { next } }}>Criar conta</Link>
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
