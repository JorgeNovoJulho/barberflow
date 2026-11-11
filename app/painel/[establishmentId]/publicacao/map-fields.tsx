"use client";

import { useEffect, useRef, useState } from "react";
import { lookupMapCoordinates } from "./actions";

export function MapFields({ initialMap = "", initialCoordinates = "" }: { initialMap?: string; initialCoordinates?: string }) {
  const [map, setMap] = useState(initialMap);
  const [coordinates, setCoordinates] = useState(initialCoordinates);
  const [status, setStatus] = useState("");
  const edit = useRef(0);

  useEffect(() => {
    if (!map.trim() || (map === initialMap && initialCoordinates)) return;
    let active = true;
    const revision = edit.current;
    const timer = setTimeout(async () => {
      setStatus("Buscando coordenadas…");
      const found = await lookupMapCoordinates(map.trim()).catch(() => null);
      if (!active || edit.current !== revision) return;
      if (found) setCoordinates(found);
      setStatus(found ? "Coordenadas preenchidas. Salve a publicação para aplicar." : "Não foi possível localizar as coordenadas no link. Você pode preenchê-las manualmente.");
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [map, initialMap, initialCoordinates]);

  return <>
    <label>Link do Google Maps <input name="map" maxLength={500} value={map} onChange={(event) => {
      setStatus("");
      setCoordinates(event.target.value === initialMap ? initialCoordinates : "");
      setMap(event.target.value);
    }} /></label>
    <div>
      <label>Coordenadas para calcular distância (latitude, longitude)
        <input name="coordinates" maxLength={48} value={coordinates} onChange={(event) => {
          edit.current++;
          setStatus("");
          setCoordinates(event.target.value);
        }} />
      </label>
      {status && <p role="status">{status}</p>}
    </div>
  </>;
}
