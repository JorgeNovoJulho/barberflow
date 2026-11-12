"use client";

import { useState, type CSSProperties } from "react";

type Item = { src: string; alt: string };

export default function CircularCarousel({ items, onSelect }: {
  items: Item[];
  onSelect: (index: number) => void;
}) {
  const [rotation, setRotation] = useState(0);
  const count = items.length;
  if (!count) return null;

  const active = ((rotation % count) + count) % count;
  return <div className="local-photo-carousel" role="group" aria-label="Carrossel de fotos do local">
    <div className="local-photo-stage">
      <div className="local-photo-ring">
        {items.map(({ src, alt }, index) => { const offset = ((index - active + Math.floor(count / 2) + count) % count) - Math.floor(count / 2); return <button
          key={index} type="button" className="local-photo-slide"
          hidden={Math.abs(offset) > 1}
          style={{ "--photo-offset": offset } as CSSProperties}
          aria-label={`Ampliar: ${alt}`} onClick={() => onSelect(index)}>
          <img src={src} alt="" loading="lazy" decoding="async" />
        </button>; })}
      </div>
    </div>
    {count > 1 && <div className="local-photo-navigation">
      <button type="button" className="secondary" onClick={() => setRotation(rotation - 1)}>Anterior</button>
      <span aria-live="polite">{active + 1} de {count}</span>
      <button type="button" className="secondary" onClick={() => setRotation(rotation + 1)}>Próxima</button>
    </div>}
  </div>;
}
