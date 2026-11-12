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

  const radius = count === 2 ? 0.45 : 0.57 / Math.tan(Math.PI / count);
  const active = ((rotation % count) + count) % count;
  return <div className="local-photo-carousel" style={{ "--photo-depth": radius } as CSSProperties} role="group" aria-label="Carrossel de fotos do local">
    <div className="local-photo-stage">
      <div className="local-photo-ring" style={{ transform: `rotateY(${-rotation * 360 / count}deg)` }}>
        {items.map(({ src, alt }, index) => <button
          key={index} type="button" className="local-photo-slide"
          data-rear={Math.cos((index - active) * 2 * Math.PI / count) < 0}
          tabIndex={index === active ? 0 : -1}
          style={{ transform: count > 1 ? `rotateY(${index * 360 / count}deg) translateZ(var(--photo-radius))` : undefined }}
          aria-label={`Ampliar: ${alt}`} onClick={() => onSelect(index)}>
          <img src={src} alt="" loading="lazy" decoding="async" />
        </button>)}
      </div>
    </div>
    {count > 1 && <div className="local-photo-navigation">
      <button type="button" className="secondary" onClick={() => setRotation(rotation - 1)}>Anterior</button>
      <span aria-live="polite">{active + 1} de {count}</span>
      <button type="button" className="secondary" onClick={() => setRotation(rotation + 1)}>Próxima</button>
    </div>}
  </div>;
}
