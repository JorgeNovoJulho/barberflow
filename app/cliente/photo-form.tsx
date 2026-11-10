import { saveSocialPhoto } from "./actions";

import { profileImageAccept } from "../../lib/profile-image-limits";
type Photo = { id:string; caption:string; audience:string };

export function PhotoForm({path,shop,photo}:{path:string;shop:string|null;photo?:Photo}) {
  return <form className="account-form card panel-form" action={saveSocialPhoto.bind(null,path,shop,photo?.id ?? null)}>
    <h3>{photo ? "Editar publicação" : "Criar publicação"}</h3>
    <label>{photo ? "Substituir imagem" : "Enviar fotos"} (até 3, de 5 MB cada) <input type="file" name="photo" multiple accept={profileImageAccept} /></label>
    <label>Texto da publicação <textarea name="caption" maxLength={500} defaultValue={photo?.caption} /></label>
    <label>Visibilidade <select name="audience" defaultValue={photo?.audience ?? "public"}>
      <option value="public">Usuários do BARBERFLOW</option><option value="followers">Somente seguidores</option><option value="private">Somente eu</option>
    </select></label>
    {shop && !photo && <label><input name="promotion" type="checkbox" /> Marcar como promoção para seguidores</label>}
    <button className="primary">{photo ? "Salvar alterações" : "Publicar"}</button>
  </form>;
}
