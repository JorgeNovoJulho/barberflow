"use client";

import { useId, useRef, useState } from "react";

export type ProductMedia = { slot: string; kind: "photo" | "video"; url: string };

export function ProductGallery({ name, items, compact = false }: { name: string; items: ProductMedia[]; compact?: boolean }) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const inlineVideo = useRef<HTMLVideoElement>(null);
  const thumbnails = useRef<HTMLDivElement>(null);
  const [selectedSlot, setSelectedSlot] = useState(items[0]?.slot);
  const [expanded, setExpanded] = useState(false);
  const index = Math.max(0, items.findIndex((item) => item.slot === selectedSlot));
  const selected = items[index];
  if (!selected) return null;

  const label = (item: ProductMedia) => item.kind === "video" ? "Vídeo" : `Foto ${item.slot.split("-")[1]}`;
  const move = (direction: number) => setSelectedSlot(items[(index + direction + items.length) % items.length].slot);
  const open = () => {
    inlineVideo.current?.pause();
    dialog.current?.showModal();
    setExpanded(true);
  };

  return <div className={compact ? "product-gallery social-post-cover" : "product-gallery"} aria-label={`Galeria de ${name}`}>
    <div className="product-gallery-stage">
      {selected.kind === "photo" ? <button className="product-gallery-photo" type="button" onClick={open}
        aria-label={`Ampliar ${label(selected).toLowerCase()} de ${name}`}>
        <img src={selected.url} alt={`${label(selected)} de ${name}`} loading="lazy" decoding="async" />
        <span aria-hidden="true">Ampliar ↗</span>
      </button> : <>
        <video key={selected.url} ref={inlineVideo} src={selected.url} controls playsInline preload="metadata" aria-label={`Vídeo de ${name}`} />
        <button type="button" className="secondary product-gallery-video-expand" onClick={open}>Ampliar vídeo</button>
      </>}
    </div>
    {!compact && items.length > 1 && <div className="product-gallery-carousel">
      <button type="button" className="secondary" aria-label="Rolar miniaturas para a esquerda" onClick={() => thumbnails.current?.scrollBy({ left: -126 })}>‹</button>
      <div ref={thumbnails} className="product-gallery-thumbnails" role="group" aria-label="Miniaturas">
        {items.map((item) => <button key={item.slot} type="button" aria-label={`Destacar ${label(item).toLowerCase()}`}
          aria-pressed={selected.slot === item.slot} onClick={() => setSelectedSlot(item.slot)}>
          {item.kind === "photo" ? <img src={item.url} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">▶</span>}
        </button>)}
      </div>
      <button type="button" className="secondary" aria-label="Rolar miniaturas para a direita" onClick={() => thumbnails.current?.scrollBy({ left: 126 })}>›</button>
    </div>}
    <dialog ref={dialog} className={compact ? "product-gallery-dialog social-fullscreen" : "product-gallery-dialog"} aria-labelledby={titleId} onClose={() => setExpanded(false)}
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      onKeyDown={(event) => {
        if (items.length < 2 || event.target instanceof HTMLVideoElement) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}>
      <div className="product-gallery-dialog-content">
        <header><h2 id={titleId}>{name}</h2>
          <button type="button" className="secondary" autoFocus onClick={() => dialog.current?.close()}>Fechar</button>
        </header>
        {expanded && (selected.kind === "photo"
          ? <img key={selected.url} src={selected.url} alt={`${label(selected)} de ${name}`} />
          : <video key={selected.url} src={selected.url} controls playsInline preload="metadata" aria-label={`Vídeo de ${name}`} />)}
        <footer>
          {items.length > 1 && <button type="button" className="secondary" onClick={() => move(-1)}>Anterior</button>}
          <span aria-live="polite">{label(selected)} · {index + 1} de {items.length}</span>
          {items.length > 1 && <button type="button" className="secondary" onClick={() => move(1)}>Próxima</button>}
        </footer>
      </div>
    </dialog>
  </div>;
}
