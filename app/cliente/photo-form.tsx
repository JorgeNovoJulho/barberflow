"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { publishSocialPost, saveSocialPhoto } from "./actions";
import { PostPhotoPicker } from "./post-photo-picker";

type Photo = { id: string; caption: string; audience: string };

function Fields({ shop, photo }: { shop: string | null; photo?: Photo }) {
  return <>
    <PostPhotoPicker replacing={!!photo} />
    <label>Texto da publicação <textarea name="caption" maxLength={500} defaultValue={photo?.caption} /></label>
    <label>Visibilidade <select name="audience" defaultValue={photo?.audience ?? "public"}>
      <option value="public">Usuários do TOP BARBER</option>
      {shop && <option value="web">Qualquer visitante da página pública</option>}
      <option value="followers">Somente seguidores</option><option value="private">Somente eu</option>
    </select></label>
    {shop && !photo && <label><input name="promotion" type="checkbox" /> Marcar como promoção para seguidores</label>}
  </>;
}

export function PhotoForm({ path, shop, photo }: { path: string; shop: string | null; photo?: Photo }) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean }>();

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = new FormData(event.currentTarget);
    requestId.current ??= crypto.randomUUID();
    sending.current = true;
    setPending(true);
    setFeedback(undefined);
    try {
      const result = await publishSocialPost(shop, requestId.current, form);
      if (result.published) {
        requestId.current = null;
        setRevision((value) => value + 1);
        setFeedback({ text: "Publicação enviada ao feed.", error: false });
        router.refresh();
      } else {
        setFeedback({ text: result.error ?? "Não foi possível publicar.", error: true });
      }
    } catch {
      setFeedback({ text: "A conexão foi interrompida. Tente novamente para conferir o envio.", error: true });
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  if (photo) return <form className="account-form card panel-form" action={saveSocialPhoto.bind(null, path, shop, photo.id)}>
    <h3>Editar publicação</h3>
    <Fields shop={shop} photo={photo} />
    <button className="primary">Salvar alterações</button>
  </form>;

  return <form className="account-form card panel-form" onSubmit={publish}>
    <h3>Criar publicação</h3>
    <fieldset key={revision} disabled={pending} className="account-form post-composer-fields">
      <legend className="visually-hidden">Conteúdo da publicação</legend>
      <Fields shop={shop} />
      <button className="primary" type="submit">{pending ? "Publicando…" : "Publicar"}</button>
    </fieldset>
    <div role="status" aria-live="polite">{feedback && <p data-feedback={feedback.error ? "error" : "success"}>{feedback.text}</p>}</div>
  </form>;
}
