import { redirect } from "next/navigation";
import { supabaseServer } from "../../lib/supabase";
import { defaultTheme, isThemeId } from "../../lib/themes";
import { signOut } from "../auth/actions";
import { ThemePicker } from "./theme-picker";

export default async function Settings() {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/login?estado=indisponivel");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/configuracoes");

  const { data, error } = await supabase.from("barberflow_user_preferences").select("theme").eq("user_id", user.id).maybeSingle();
  const theme = isThemeId(data?.theme) ? data.theme : defaultTheme;
  return <section className="container section">
    <h1>Configurações</h1>
    <div className="card">
      <h2>Aparência</h2>
      {error && <p role="status">As preferências estão indisponíveis neste ambiente.</p>}
      <ThemePicker initialTheme={theme} />
    </div>
    <form className="account-links" action={signOut}><button type="submit">Sair da conta</button></form>
  </section>;
}
