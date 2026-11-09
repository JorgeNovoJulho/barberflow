import Link from "next/link";
import { AccountForm, Email } from "../auth/form";
import { requestReset } from "../auth/actions";
import { localPath } from "../../lib/auth-path";

export default async function Page({ searchParams }: { searchParams: Promise<{ estado?: string; erro?: string; next?: string }> }) {
  const params = await searchParams;
  const next = localPath(params.next);
  return <AccountForm title="Recuperar senha" description="Informe o e-mail associado à sua conta." status={params.estado ?? params.erro} action={requestReset} submit="Enviar link de redefinição" next={next} links={<><Link href="/login">Voltar para o login</Link></>}>
      <Email />
  </AccountForm>;
}
