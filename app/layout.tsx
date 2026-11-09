import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { supabaseServer } from "../lib/supabase";
import { defaultTheme, isThemeId } from "../lib/themes";
import "./styles.css";

export const metadata: Metadata = {
  title: { default: "BARBERFLOW", template: "%s | BARBERFLOW" },
  description: "Agendamento online e gestão para profissionais e negócios de beleza e bem-estar.",
};

export default async function Layout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const user = supabase ? (await supabase.auth.getClaims()).data?.claims.sub : undefined;
  const preference = supabase && user
    ? (await supabase.from("barberflow_user_preferences").select("theme").eq("user_id", user).maybeSingle()).data
    : null;
  const theme = isThemeId(preference?.theme) ? preference.theme : defaultTheme;

  return (
    <html lang="pt-BR" data-theme={theme}>
      <body>
        <header className="site-header">
          <div className="container navigation">
            <Link className="wordmark" href="/">BARBER<span>FLOW</span></Link>
            <nav aria-label="Principal">
              <Link href="/#segmentos">Para quem</Link>
              <Link href="/estabelecimentos">Encontrar serviços</Link>
              <Link href="/#funcionalidades">Funcionalidades</Link>
              <Link href="/planos">Planos</Link>
              <Link href="/#duvidas">Dúvidas</Link>
              {user && <Link href="/painel">Meu painel</Link>}
              {user && <Link href="/meus-agendamentos">Minhas reservas</Link>}
              {user ? <Link href="/configuracoes">Configurações</Link> : <Link href="/login">Entrar</Link>}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="container footer">BARBERFLOW · Gestão para beleza e bem-estar</footer>
      </body>
    </html>
  );
}
