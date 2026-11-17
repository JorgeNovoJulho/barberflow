"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { Fragment, useRef, useState, type FormEvent, type ReactNode } from "react";
import { productImageLimit, productImageTypes, productVideoTypes } from "../../../../lib/product-media";
import { serviceMediaBucket, serviceVideoLimit } from "../../../../lib/service-media-config";
import { serviceVideoEmbed } from "../../../../lib/service-presentation";
import { saveService } from "../../actions";

export function ServiceSubmitForm({ shop, service, team, children }: {
  shop: string;
  service: string | null;
  team: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const videoLink = String(data.get("video_url") ?? "").trim();
    if (videoLink && !serviceVideoEmbed(videoLink)) {
      setMessage("Informe o link completo de um vídeo do YouTube, TikTok ou Instagram.");
      return;
    }
    const photos = data.getAll("photo").filter((file): file is File => file instanceof File && file.size > 0);
    const video = data.get("video");
    if (photos.length > 5 || photos.some(file => file.size > productImageLimit || !productImageTypes.includes(file.type))
      || (!videoLink && video instanceof File && video.size > 0 && (video.size > serviceVideoLimit || !productVideoTypes.includes(video.type)))) {
      setMessage("Confira os formatos e os limites de até 5 fotos de 5 MB cada e 1 vídeo de 15 MB.");
      return;
    }
    const media = photos.map(file => ({ kind: "photo", file }));
    if (!videoLink && video instanceof File && video.size) media.push({ kind: "video", file: video });
    data.delete("photo");
    data.delete("video");

    submitting.current = true;
    setPending(true);
    setMessage("");
    const uploaded: string[] = [];
    let savingRecord = false;
    try {
      const bucket = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      ).storage.from(serviceMediaBucket);
      for (const { kind, file } of media) {
        const object = `${shop}/${crypto.randomUUID()}-${kind}`;
        const { error } = await bucket.upload(object, file, { contentType: file.type });
        if (error) {
          if (uploaded.length) await bucket.remove(uploaded);
          setMessage(kind === "photo" ? "Não foi possível enviar a foto. Tente novamente." : "Não foi possível enviar o vídeo. Tente novamente.");
          return;
        }
        uploaded.push(object);
        data.append(`${kind}_path`, object);
      }

      savingRecord = true;
      const result = await saveService(shop, service, team, data);
      if (result === "salvo") {
        setRevision(value => value + 1);
        const path = `/${team ? "equipe" : "painel"}/${shop}/servicos?estado=salvo`;
        router.replace(path);
        router.refresh();
        return;
      }
      if (result !== "incerto" && uploaded.length) await bucket.remove(uploaded);
      setMessage(result === "invalido" ? "Confira o nome, o valor, a duração e a ordem do serviço."
        : result === "incerto" ? "Não foi possível confirmar o salvamento. Confira o catálogo antes de reenviar."
        : "Não foi possível salvar o serviço. Confira se você ainda tem permissão para gerenciar o catálogo.");
    } catch {
      setMessage(savingRecord ? "Não foi possível confirmar o salvamento. Confira o catálogo antes de reenviar."
        : "A conexão foi interrompida durante o envio. Tente novamente.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <form className="account-form" onSubmit={submit} aria-busy={pending}>
    <Fragment key={revision}>{children}</Fragment>
    <button className="primary" type="submit" disabled={pending}>{pending ? "Salvando serviço…" : "Salvar serviço"}</button>
    {message && <p role="alert">{message}</p>}
  </form>;
}
