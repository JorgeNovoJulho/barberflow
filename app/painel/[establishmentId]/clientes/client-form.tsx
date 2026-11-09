import { SubmitButton } from "../../../auth/submit";
import { saveClient } from "./actions";

export type Client = { id: string; name: string; phone: string; preferences: string; notes: string; active: boolean };

export function ClientForm({ shop, client, team = false }: { shop: string; client?: Client; team?: boolean }) {
  return <form className="account-form" action={saveClient.bind(null, shop, client?.id ?? null, team)}>
    <label>Nome <input name="name" maxLength={120} required defaultValue={client?.name} /></label>
    <label>WhatsApp <input name="phone" type="tel" maxLength={30} defaultValue={client?.phone} /></label>
    <label>Preferências <textarea name="preferences" rows={2} maxLength={1000} defaultValue={client?.preferences} /></label>
    <label>Observações internas <textarea name="notes" rows={2} maxLength={1000} defaultValue={client?.notes} /></label>
    {client && <label><input name="active" type="checkbox" defaultChecked={client.active} /> Cliente ativo</label>}
    <SubmitButton>Salvar cliente</SubmitButton>
  </form>;
}
