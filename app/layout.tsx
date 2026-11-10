import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { hasMasterSession, masterPath } from "../lib/master";
import { policyLinks } from "../lib/auth-path";
import { supabaseServer } from "../lib/supabase";
import { defaultTheme, isThemeId } from "../lib/themes";
import { AccountActivity } from "./account-activity";
import { signOut } from "./auth/actions";
import { MobileNav } from "./mobile-nav";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "./styles.css";
import "./visual.css";
import "./editorial.css";
import "./app-polish.css";

export const metadata: Metadata = {
  title: { default: "BARBERFLOW", template: "%s | BARBERFLOW" },
  description: "Agendamento online e gestão para profissionais e negócios de beleza e bem-estar.",
};

export default async function Layout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const claims = supabase ? (await supabase.auth.getClaims()).data?.claims : undefined;
  const user = claims?.sub;
  const master = user && await hasMasterSession();
  const role = supabase && user ? (await supabase.rpc("barberflow_account_kind")).data : null;
  const preference = supabase && user
    ? (await supabase.from("barberflow_user_preferences").select("theme").eq("user_id", user).maybeSingle()).data
    : null;
  const theme = isThemeId(preference?.theme) ? preference.theme : defaultTheme;
  const policies = policyLinks();
  const navigation = <>
    <Link href="/#segmentos">Para quem</Link>
    <Link href="/estabelecimentos">Encontrar serviços</Link>
    <Link href="/#funcionalidades">Funcionalidades</Link>
    <Link href="/planos">Planos</Link>
    <Link href="/#duvidas">Dúvidas</Link>
    <Link href="/sobre">Sobre</Link>
    {user && <Link href={role === "cliente" ? "/cliente" : "/painel"}>Meu painel</Link>}
    {user && <Link href="/meus-agendamentos">Minhas reservas</Link>}
    {user && <Link href="/minhas-compras">Minhas compras</Link>}
    {user ? <Link className="header-action" href="/configuracoes">Configurações</Link> : <Link className="header-action" href="/login">Entrar</Link>}
    {user && <form action={signOut}><button className="secondary">Sair do sistema</button></form>}
  </>;

  return (
    <html lang="pt-BR" data-theme={theme}>
      <body>
        {user && <AccountActivity />}
        <header className="site-header">
          <div className="container navigation">
            <Link className="wordmark" href="/" aria-label="BARBERFLOW, início">
              <svg className="brand-mark" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect width="32" height="32" rx="9" fill="currentColor" />
                <path d="M8 21.5h6.5l4-11h5.5M8 16h4m8 0h4" stroke="#191517" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="brand-name">BARBER<span>FLOW</span></span>
            </Link>
            <nav className="desktop-nav" aria-label="Principal">{navigation}</nav>
            {master && <Link className="header-action master-header-link" href={masterPath}>Administrador</Link>}
            <MobileNav>{navigation}</MobileNav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div className="container footer-content">
            <div><strong>BARBERFLOW</strong><p>Gestão para beleza e bem-estar.</p></div>
            <nav aria-label="Rodapé"><Link href="/estabelecimentos">Encontrar serviços</Link><Link href="/planos">Planos</Link>{policies && <><a href={policies.terms}>Termos de Uso</a><a href={policies.privacy}>Política de Privacidade</a></>}</nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
