import { productImageTypes } from "../../../../lib/product-media";
import { SubmitButton } from "../../../auth/submit";
import { saveClient } from "./actions";

export type Client = { id: string; name: string; phone: string; preferences: string; notes: string; active: boolean;
  email?: string; instagram?: string; facebook?: string; tiktok?: string; youtube?: string; photo_path?: string };

export function ClientForm({ shop, client, photo, team = false }: { shop: string; client?: Client; photo?: string; team?: boolean }) {
  return <form className="account-form" action={saveClient.bind(null, shop, client?.id ?? null, team)}>
    <label>Nome <input name="name" maxLength={120} required defaultValue={client?.name} /></label>
    <label>WhatsApp <input name="phone" type="tel" maxLength={30} defaultValue={client?.phone} /></label>
    <div className="publication-columns">
      <label>E-mail <input name="email" type="email" maxLength={254} defaultValue={client?.email} /></label>
      <label>Instagram <input name="instagram" maxLength={31} placeholder="@usuario" defaultValue={client?.instagram} /></label>
      <label>Facebook <input name="facebook" type="url" maxLength={500} defaultValue={client?.facebook} /></label>
      <label>TikTok <input name="tiktok" type="url" maxLength={500} defaultValue={client?.tiktok} /></label>
      <label>YouTube <input name="youtube" type="url" maxLength={500} defaultValue={client?.youtube} /></label>
    </div>
    {photo && <img className="business-logo" src={photo} alt="Foto salva do cliente" />}
    <label>Foto do cliente (até 5 MB) <input name="photo" type="file" accept={productImageTypes.join(",")} /></label>
    <label>Preferências <textarea name="preferences" rows={2} maxLength={1000} defaultValue={client?.preferences} /></label>
    <label>Observações internas <textarea name="notes" rows={2} maxLength={1000} defaultValue={client?.notes} /></label>
    {client && <label><input name="active" type="checkbox" defaultChecked={client.active} /> Cliente ativo</label>}
    <SubmitButton>Salvar cliente</SubmitButton>
  </form>;
}
