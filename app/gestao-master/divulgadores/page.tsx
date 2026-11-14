import { mediaLinks } from "../../cliente/social";
import { requireMaster } from "../../../lib/master";
import { authOrigin } from "../../../lib/auth-path";
import { MasterTabs } from "../master-ui";
import { createInvite, saveCommission, managePromoter } from "./actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ convite?: string; erro?: string; salvo?: string; indicados?: string }> }) {
  const client = await requireMaster("/gestao-master/divulgadores");
  const { data: promoters, error } = await client.rpc("barberflow_list_promoters");
  const { data: rates } = await client.rpc("barberflow_promoter_rates");
  const { convite, erro, salvo, indicados } = await searchParams;
  const selected = (promoters ?? []).find((person: { id: string }) => person.id === indicados);
  const referrals = selected ? await client.rpc("barberflow_promoter_referral_list", { member: selected.id }) : null;
  const { data: profiles } = await client.rpc("barberflow_promoter_card_profiles");
  type Profile = { id: string; avatar: string | null; slug: string | null; has_profile: boolean };
  const cards = new Map<string, Profile>((profiles ?? []).map((profile: Profile) => [profile.id, profile]));
  const photos = await mediaLinks(client, [...(profiles ?? []), ...(referrals?.data ?? [])]
    .flatMap((row: { avatar: string | null }) => row.avatar ? [row.avatar] : []));
  return <section className="container section">
    <MasterTabs current="/gestao-master/divulgadores" />
    <h1>Gestão de divulgadores</h1>
    <form action={createInvite}><button className="primary">Gerar link de convite para divulgador</button></form>
    <form className="card account-form panel-form" action={saveCommission}>
      <h2>Comissão por primeira assinatura</h2>
      <div className="form-columns">
        {Object.entries({ pro_monthly: "Pro mensal", pro_yearly: "Pro anual", premium_monthly: "Premium mensal", premium_yearly: "Premium anual" }).map(([key, label]) =>
          <label key={key}>{label} (%) <input name={key} type="number" min={0} max={100} step="0.01" defaultValue={rates?.[key]} required /></label>)}
      </div>
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
        <h2 className="subscription-business"><Avatar name={person.name} photo={photos.get(cards.get(person.id)?.avatar ?? "")} />{person.name}</h2>
        {cards.get(person.id)?.slug ? <a className="secondary" href={"/estabelecimento/" + cards.get(person.id)?.slug}>Página pública</a>
          : cards.get(person.id)?.has_profile && <a className="secondary" href={"/cliente?perfil=" + person.id}>Ver perfil</a>}<p>{person.email}</p>
        <a className="secondary" href={"?indicados=" + person.id + "#indicados"}>Ver contas indicadas</a>
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
    {selected && <section id="indicados" className="card">
      <h2>Contas indicadas por {selected.name}</h2>
      {referrals?.error ? <p role="alert">Não foi possível consultar as indicações.</p>
        : referrals?.data?.length ? <ul>{referrals.data.map((row: { id: string; name: string; joined: string; kind: string | null; plan: string | null; period: string | null; validity: string | null; avatar: string | null }) =>
          <li key={row.id}><strong className="subscription-business"><Avatar name={row.name} photo={photos.get(row.avatar ?? "")} />{row.name}</strong>
            <p>{row.kind === "barbearia" ? "Estabelecimento" : row.kind === "cliente" ? "Cliente" : "Tipo não informado"} · Cadastro em {new Date(row.joined).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
            <p>{row.validity ? <>{row.plan === "premium" ? "Premium" : row.plan === "pro" ? "Pro" : "Plano anterior"} {row.period === "yearly" ? "anual" : "mensal"} · Vence em {row.validity.split("-").reverse().join("/")}</> : "Sem assinatura confirmada"}</p>
          </li>)}</ul> : <p>Nenhuma conta indicada.</p>}
    </section>}
  </section>;
}


function Avatar({ name, photo }: { name: string; photo?: string }) {
  return photo ? <img className="booking-avatar" src={photo} alt="" width={36} height={36} loading="lazy" />
    : <span className="booking-avatar booking-avatar-fallback" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>;
}