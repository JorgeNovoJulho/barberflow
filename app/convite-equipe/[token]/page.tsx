import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../lib/establishments";
import { supabaseServer } from "../../../lib/supabase";
import { SubmitButton } from "../../auth/submit";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

async function accept(token: string) {
  "use server";
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const path = `/convite-equipe/${token}`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  const { data, error } = await supabase.rpc("barberflow_accept_team", { invite_token: token });
  if (error || typeof data !== "string" || !isUuid(data)) redirect(path + "?estado=invalido");
  redirect(`/equipe/${data}`);
}

export default async function Invite({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ estado?: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const { estado } = await searchParams;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  const next = "/convite-equipe/" + token;
  return <section className="container section">
    <h1>Convite para a equipe</h1>
    <p>Use a conta confirmada que corresponde ao e-mail do convite.</p>
    {estado === "invalido" && <p role="alert">Convite indisponível. Confira se entrou com o e-mail correto e se o convite ainda está válido.</p>}
    {user ? <form action={accept.bind(null, token)}><SubmitButton>Aceitar convite</SubmitButton></form>
      : <Link className="primary" href={"/login?" + new URLSearchParams({ next })}>Entrar para aceitar</Link>}
  </section>;
}
