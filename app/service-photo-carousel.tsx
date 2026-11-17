"use client";

import { useState } from "react";

export function ServicePhotoCarousel({ photos, name }: { photos: string[]; name: string }) {
  const [selected, setSelected] = useState(0);
  const index = selected % photos.length;
  return <div className="service-photo-carousel" aria-label={`Fotos do serviço ${name}`}>
    <img src={photos[index]} alt={`Foto ${index + 1} do serviço ${name}`} loading="lazy" />
    {photos.length > 1 && <div className="account-links">
      <button type="button" className="secondary" onClick={() => setSelected((index + photos.length - 1) % photos.length)}>Anterior</button>
      <span aria-live="polite">{index + 1} de {photos.length}</span>
      <button type="button" className="secondary" onClick={() => setSelected((index + 1) % photos.length)}>Próxima</button>
    </div>}
  </div>;
}
