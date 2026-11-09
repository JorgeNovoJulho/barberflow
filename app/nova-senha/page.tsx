import Link from "next/link";
import { AccountForm, Password } from "../auth/form";
import { updatePassword } from "../auth/actions";
import { localPath } from "../../lib/auth-path";

export default async function Page({ searchParams }: { searchParams: Promise<{ estado?: string; erro?: string; next?: string }> }) {
  const params = await searchParams;
  const next = localPath(params.next);
  return <AccountForm title="Nova senha" description="Escolha uma senha de pelo menos oito caracteres, com letras e números." status={params.estado ?? params.erro} action={updatePassword} submit="Salvar nova senha" next={next} links={<><Link href="/recuperar-senha">Solicitar outro link</Link></>}>
      <Password isNew /><Password isNew confirmation />
  </AccountForm>;
}
