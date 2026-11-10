import { requireMaster } from "../../../lib/master";
import { SubmitButton } from "../../auth/submit";
import { MasterCards, MasterPagination, MasterTabs, masterDate, reportPage } from "../master-ui";
import { requestUserRecovery } from "./actions";

const path = "/gestao-master/usuarios";

type User = { id: string; email: string | null; name: string | null; intent: string | null; created_at: string;
  email_confirmed_at: string | null; last_sign_in_at: string | null; banned_until: string | null;
  seen_at: string | null; online: boolean; businesses: number };
type Report = { total: number; confirmed: number; online: number; filtered: number; rows: User[] };

export default async function UsersAdmin({ searchParams }: { searchParams: Promise<{ busca?: string; pagina?: string; estado?: string }> }) {
  const supabase = await requireMaster(path);
  const params = await searchParams;
  const search = typeof params.busca === "string" ? params.busca.trim().slice(0,120) : "";
  const page = reportPage(params.pagina);
  const { data } = await supabase.rpc("barberflow_master_users", { search_text: search, page_index: page });
  const report = data as Report | null;
  const recoveryEnabled = process.env.BARBERFLOW_MASTER_RECOVERY_EMAILS === "true";
  return <section className="container section">
    <MasterTabs current={path} />
    <h1>Contas e Usuários</h1>
    {params.estado === "enviado" && <p role="status">Solicitação de recuperação enviada ao provedor de e-mail.</p>}
    {params.estado === "smtp" && <p role="alert">O envio administrativo depende da configuração de e-mail do Supabase.</p>}
    {params.estado === "falha" && <p role="alert">Não foi possível solicitar a recuperação para essa conta.</p>}
    {report ? <>
      <MasterCards items={[["Contas cadastradas", report.total], ["E-mails confirmados", report.confirmed],
        ["Ativos recentemente", report.online], ["E-mails pendentes", report.total - report.confirmed]]} />
      <p>O indicador online considera atividade em uma aba visível nos últimos três minutos.</p>
      <form className="agenda-date">
        <label>Nome ou e-mail <input name="busca" maxLength={120} defaultValue={search} /></label>
        <button type="submit" className="secondary">Buscar</button>
      </form>
      <p>{report.filtered} resultado(s)</p>
      <ul className="cards">{report.rows.map((user) => <li className="card" key={user.id}>
        <h2>{user.name || "Conta BARBERFLOW"}</h2>
        <p>{user.email ?? "Sem e-mail"} · {user.banned_until && Date.parse(user.banned_until)>Date.now() ? "Bloqueada" : user.online ? "Online recente" : "Sem atividade recente"}</p>
        <dl className="order-totals">
          <div><dt>Perfil</dt><dd>{user.intent === "barbearia" ? "Estabelecimento" : user.intent === "cliente" ? "Cliente" : "Sem classificação"}</dd></div>
          <div><dt>Cadastro</dt><dd>{masterDate(user.created_at)}</dd></div>
          <div><dt>E-mail confirmado</dt><dd>{masterDate(user.email_confirmed_at)}</dd></div>
          <div><dt>Último login</dt><dd>{masterDate(user.last_sign_in_at)}</dd></div>
          <div><dt>Última atividade</dt><dd>{masterDate(user.seen_at)}</dd></div>
          <div><dt>Estabelecimentos</dt><dd>{user.businesses}</dd></div>
        </dl>
        {user.email_confirmed_at && <details><summary>Recuperação de senha</summary>
          <p>O titular recebe um link para escolher uma nova senha.</p>
          {recoveryEnabled ? <form action={requestUserRecovery.bind(null, user.id)}><SubmitButton>Enviar recuperação por e-mail</SubmitButton></form>
            : <p>Envio administrativo indisponível até a configuração do e-mail no Supabase.</p>}
        </details>}
      </li>)}</ul>
      <MasterPagination page={page} total={report.filtered} search={search} />
    </> : <p role="alert">Não foi possível carregar o relatório de contas.</p>}
  </section>;
}
