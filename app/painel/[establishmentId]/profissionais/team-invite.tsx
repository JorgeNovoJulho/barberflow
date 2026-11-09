"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../../auth/submit";
import { createTeamInvite, type InviteResult } from "./team-actions";

export function TeamInvite({ shop, professionals }: { shop: string; professionals: { id: string; name: string }[] }) {
  const [state, submit] = useActionState(createTeamInvite.bind(null, shop), {} as InviteResult);
  return <>
    <form className="account-form" action={submit}>
      <label>E-mail <input name="email" type="email" maxLength={254} required /></label>
      <label>Agenda vinculada <select name="professional" defaultValue="">
        <option value="">Nenhuma</option>
        {professionals.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select></label>
      <label><input type="checkbox" name="see_all" /> Ver a agenda de todos os profissionais</label>
      <label><input type="checkbox" name="manage_all" /> Criar, remarcar e alterar agendamentos de todos</label>
      <label><input type="checkbox" name="manage_clients" /> Ver e editar a base de clientes</label>
      <label><input type="checkbox" name="manage_services" /> Gerenciar serviços e preços</label>
      <label><input type="checkbox" name="manage_professionals" /> Gerenciar profissionais, horários e imagens</label>
      <p>Gerenciar todos inclui visualizar todas as agendas. Com vínculo, a equipe pode gerenciar a própria agenda. O convite vale por sete dias.</p>
      <SubmitButton>Gerar convite</SubmitButton>
    </form>
    {state.error && <p role="alert">{state.error}</p>}
    {state.link && <label>Link do convite para compartilhar <input readOnly value={state.link} onFocus={(event) => event.currentTarget.select()} /></label>}
  </>;
}
