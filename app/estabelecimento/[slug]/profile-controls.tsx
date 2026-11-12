"use client";

import { useRef, useState } from "react";
import CircularCarousel from "./CircularCarousel";

export function ShareProfile({ title, path, showLink = false }: { title: string; path?: string; showLink?: boolean }) {
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return <div>
    {showLink && path && <div className="publication-share">
      <label>Link público <input ref={input} value={path} readOnly /></label>
      <button type="button" className="secondary" onClick={async () => {
        try {
          await navigator.clipboard.writeText(path);
          setMessage("Link copiado.");
        } catch {
          input.current?.select();
          setMessage("Copie o endereço selecionado.");
        }
      }}>Copiar link</button>
    </div>}
    <button type="button" className="secondary" onClick={async () => {
      try {
        const url = path ? new URL(path, window.location.origin).href : window.location.href;
        if (navigator.share) await navigator.share({ title, url });
        else {
          await navigator.clipboard.writeText(url);
          setMessage("Link copiado.");
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setMessage(path ? "Abra a página pública para copiar o endereço." : "Copie o endereço na barra do navegador.");
      }
    }}>Compartilhar</button>
    {message && <p role="status">{message}</p>}
  </div>;
}

export function ProfileGallery({ images, title }: { images: string[]; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  return <>
    <CircularCarousel items={images.map((src, position) => ({ src, alt: `Foto ${position + 1} de ${title}` }))}
      onSelect={(position) => {
        setIndex(position);
        setExpanded(true);
        dialog.current?.showModal();
      }} />
    <dialog ref={dialog} onClose={() => setExpanded(false)} className="profile-gallery-dialog" aria-label={`Fotos de ${title}`}>
      <button type="button" className="secondary" autoFocus onClick={() => dialog.current?.close()}>Fechar</button>
      <img src={expanded ? images[index] : undefined} alt={`Foto ${index + 1} de ${title}`} />
      {images.length > 1 && <div className="account-links">
        <button type="button" className="secondary" onClick={() => setIndex((index + images.length - 1) % images.length)}>Anterior</button>
        <span aria-live="polite">{index + 1} de {images.length}</span>
        <button type="button" className="secondary" onClick={() => setIndex((index + 1) % images.length)}>Próxima</button>
      </div>}
    </dialog>
  </>;
}
