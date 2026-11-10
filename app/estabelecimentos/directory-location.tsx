"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { distanceKm, type Coordinates } from "../../lib/directory-distance";

const LocationContext = createContext<Coordinates | null>(null);
const format = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function DirectoryLocation({ children, available }: { children: ReactNode; available: boolean }) {
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  function locate() {
    if (!navigator.geolocation) { setMessage("Este navegador não oferece localização."); return; }
    setPending(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocation({ latitude: coords.latitude, longitude: coords.longitude });
      setPending(false);
    }, error => {
      setMessage(error.code === 1 ? "Permita o acesso à localização no navegador para calcular as distâncias." : "Não foi possível obter sua localização. Tente novamente.");
      setPending(false);
    }, { timeout: 10000, maximumAge: 120000 });
  }
  return <LocationContext.Provider value={location}>
    {available && <div className="directory-location-control">
      <button className="secondary" type="button" onClick={locate} disabled={pending}>
        {pending ? "Obtendo localização…" : location ? "Atualizar minha localização" : "Usar minha localização"}
      </button>
      {message && <p role="alert">{message}</p>}
    </div>}
    {children}
  </LocationContext.Provider>;
}

export function DirectoryDistance({ destination }: { destination: Coordinates | null }) {
  const location = useContext(LocationContext);
  const distance = location && destination ? distanceKm(location, destination) : null;
  return <p className="directory-distance">
    {!destination ? "Distância indisponível" : distance === null ? "Ative a localização para ver a distância"
      : distance < .05 ? "A menos de 0,1 km em linha reta" : `${format.format(distance)} km em linha reta`}
  </p>;
}
