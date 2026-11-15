import { InstallApp } from "./install-app";
import { redirect } from "next/navigation";
import { supabaseServer } from "../../lib/supabase";
import { defaultTheme, isThemeId } from "../../lib/themes";
import { signOut } from "../auth/actions";
import { ThemePicker } from "./theme-picker";

import { configureStoreReset, restoreStore } from "./store-reset-actions";
import { PasswordField } from "../painel/[establishmentId]/financeiro/password-field";
import { SubmitButton } from "../auth/submit";

export default async function Settings({ searchParams }: {
  searchParams: Promise<{ restauracao?: string }>;
}) {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/login?estado=indisponivel");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/configuracoes");

  const { data, error } = await supabase.from("barberflow_user_preferences").select("theme").eq("user_id", user.id).maybeSingle();
  const { data: shops } = await supabase.from("barberflow_establishments").select("id,name").eq("owner_id", user.id).order("name");
  const { restauracao } = await searchParams;
  const theme = isThemeId(data?.theme) ? data.theme : defaultTheme;
  return <section className="container section">
    <h1>Configurações</h1>
    <InstallApp />
    <div className="card">
      <h2>Aparência</h2>
      {error && <p role="status">As preferências estão indisponíveis neste ambiente.</p>}
      <ThemePicker initialTheme={theme} />
    </div>
    {!!shops?.length && <details className="card" id="senha-de-restauracao" open={restauracao ? true : undefined}>
      <summary>Senha de restauração da loja</summary>
      <p>Configure uma senha exclusiva para a loja selecionada. Salvar a senha não apaga dados.</p>
      {restauracao === "salva" && <p role="status">Senha de restauração salva.</p>}
      {restauracao === "erro" && <p role="alert">Não foi possível salvar. Confira a senha atual e a confirmação. Se houve várias tentativas, aguarde 15 minutos.</p>}
      <form className="account-form" action={configureStoreReset}>
        <label>Loja <select name="shop" required>{shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
        <PasswordField label="Senha atual da conta" name="current" autoComplete="current-password" minLength={1} maxLength={null} />
        <PasswordField label="Nova senha de restauração" name="password" autoComplete="new-password" minLength={12} />
        <PasswordField label="Confirmar senha de restauração" name="confirmation" autoComplete="new-password" minLength={12} />
        <p>Use pelo menos 12 caracteres e uma senha diferente da sua senha de login.</p>
        <SubmitButton>Salvar senha de restauração</SubmitButton>
      </form>
    </details>}
    {!!shops?.length && <details className="card" id="restaurar-loja" open={restauracao === "falha" || restauracao === "concluida" ? true : undefined}>
      <summary className="secondary finance-tab command-action" data-tone="rose">Restaurar loja do zero</summary>
      {restauracao === "falha" && <p role="alert">A restauração não foi executada. Confira o nome da loja e a senha de restauração. Após várias tentativas, aguarde 15 minutos.</p>}
      {restauracao === "concluida" && <p role="status">Loja restaurada. Abra o painel para configurar a loja novamente.</p>}
      <p><strong>Exclusão permanente.</strong> A restauração apaga os cadastros, histórico operacional, mídia exibida e acessos da equipe da loja escolhida. O login do proprietário e a assinatura serão preservados.</p>
      <form className="account-form" action={restoreStore}>
        <label>Loja <select name="shop" required>{shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
        <label>Digite o nome exato da loja <input name="shop_name" required maxLength={120} autoComplete="off" /></label>
        <PasswordField label="Senha de restauração" name="secret" autoComplete="off" minLength={12} />
        <label><input type="checkbox" name="acknowledged" value="yes" required /> Confirmo a exclusão permanente dos dados da loja selecionada.</label>
        <SubmitButton>Apagar dados da loja</SubmitButton>
      </form>
    </details>}
    <form className="account-links" action={signOut}><button type="submit">Sair da conta</button></form>
  </section>;
}
