import { requireMaster } from "../../../lib/master";
import { authOrigin } from "../../../lib/auth-path";
import { MasterTabs } from "../master-ui";
import { createInvite, saveCommission, managePromoter } from "./actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ convite?: string; erro?: string; salvo?: string }> }) {
  const client = await requireMaster("/gestao-master/divulgadores");
  const { data: promoters, error } = await client.rpc("barberflow_list_promoters");
  const { convite, erro, salvo } = await searchParams;
  return <section className="container section">
    <MasterTabs current="/gestao-master/divulgadores" />
    <h1>Gestão de divulgadores</h1>
    <form action={createInvite}><button className="primary">Gerar link de convite para divulgador</button></form>
    <form className="card account-form panel-form" action={saveCommission}>
      <label>Comissão por primeira mensalidade (em centavos) <input name="cents" type="number" min={0} max={99999999} required /></label>
      <button className="primary">Salvar comissão</button>
    </form>
    {salvo && <p role="status">Alteração salva.</p>}
    {erro && <p role="alert">Não foi possível concluir a operação.</p>}
    {convite && /^[a-f0-9]{64}$/.test(convite) && <label>Convite válido por 48 horas
      <input readOnly value={new URL("/convite-divulgador/" + convite, authOrigin()).href} />
    </label>}
    {error && <p role="alert">Não foi possível consultar os divulgadores.</p>}
    <ul className="cards">{(promoters ?? []).map((person: { id: string; name: string; email: string; first_access: string | null; pix: string | null; benefit: string; referrals: number; commission: number; pending: number }) =>
      <li key={person.id} className="card">
        <h2>{person.name}</h2><p>{person.email}</p>
        <p>Benefício: {person.benefit} · {person.referrals} indicações</p>
        <p>Primeiro acesso: {person.first_access ? new Date(person.first_access).toLocaleDateString("pt-BR") : "Pendente"}</p>
        <p>Pix: {person.pix ?? "Pendente"}</p>
        <p>Comissão em centavos: {person.commission} gerados · {person.pending} a pagar</p>
        <form action={managePromoter.bind(null, person.id)} className="account-form">
          <label>Isenção até <input name="until" type="date" /></label>
          <button className="secondary" name="operation" value="exempt">Salvar isenção</button>
          <button className="secondary" name="operation" value="suspend">Suspender desconto</button>
          <button className="secondary" name="operation" value="restore">Restaurar desconto</button>
          <button className="secondary" name="operation" value={person.benefit === "Bloqueado" ? "unblock" : "block"}>{person.benefit === "Bloqueado" ? "Desbloquear acesso" : "Bloquear acesso"}</button>
        </form>
        {person.pending > 0 && <details><summary>Registrar repasse</summary><form action={managePromoter.bind(null, person.id)}><button name="operation" value="paid" className="secondary">Confirmar repasse das comissões pendentes</button></form></details>}
        <details><summary>Excluir conta</summary><form action={managePromoter.bind(null, person.id)}>
          <button className="secondary" name="operation" value="delete">Confirmar exclusão da conta</button>
        </form></details>
      </li>)}</ul>
  </section>;
}
