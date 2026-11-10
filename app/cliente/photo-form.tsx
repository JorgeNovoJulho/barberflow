import { saveSocialPhoto } from "./actions";

const images = "image/jpeg,image/png,image/webp,image/avif";
type Photo = { id:string; caption:string; audience:string };

export function PhotoForm({path,shop,photo}:{path:string;shop:string|null;photo?:Photo}) {
  return <form className="account-form card panel-form" action={saveSocialPhoto.bind(null,path,shop,photo?.id ?? null)}>
    <h3>{photo ? "Editar publicação" : "Adicionar foto"}</h3>
    <label>{photo ? "Substituir imagem" : "Imagem"} de até 2 MB <input type="file" name="photo" accept={images} required={!photo} /></label>
    <label>Legenda <textarea name="caption" maxLength={500} defaultValue={photo?.caption} /></label>
    <label>Visibilidade <select name="audience" defaultValue={photo?.audience ?? "public"}>
      <option value="public">Usuários do BARBERFLOW</option><option value="followers">Somente seguidores</option><option value="private">Somente eu</option>
    </select></label>
    {shop && !photo && <label><input name="promotion" type="checkbox" /> Marcar como promoção para seguidores</label>}
    <button className="primary">Salvar publicação</button>
  </form>;
}
