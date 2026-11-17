"use client";

import { useEffect, useState } from "react";
import { productImageLimit, productImageTypes, productVideoTypes } from "../../../../lib/product-media";
import { serviceVideoLimit } from "../../../../lib/service-media-config";

export function ServiceDurationField({ initialMinutes }: { initialMinutes: number }) {
  const [minutesMode, setMinutesMode] = useState(false);
  const [value, setValue] = useState(() => String(Number((initialMinutes / 60).toFixed(6))));
  return <div>
    <label>Duração ({minutesMode ? "minutos" : "horas"})
      <input name="duration" type="number" min={minutesMode ? 1 : 0.0166667}
        max={minutesMode ? 1440 : 24} step={minutesMode ? 1 : "any"}
        required value={value} onChange={event => setValue(event.currentTarget.value)} />
    </label>
    <label><input name="duration_in_minutes" type="checkbox" checked={minutesMode} onChange={event => {
      const checked = event.currentTarget.checked;
      setMinutesMode(checked);
      setValue(value === "" ? "" : String(checked ? Math.round(Number(value) * 60) : Number((Number(value) / 60).toFixed(6))));
    }} /> Informar em minutos</label>
  </div>;
}

export function ServiceMediaField({ kind, label }: { kind: "photo" | "video"; label: string }) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const photo = kind === "photo";
  const types = photo ? productImageTypes : productVideoTypes;
  const limit = photo ? productImageLimit : serviceVideoLimit;

  useEffect(() => {
    if (!file || !file.size || file.size > limit || !types.includes(file.type)) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, limit, types]);

  return <>
    <label>{label} <input type="file" name={kind} accept={types.join(",")}
      onChange={event => setFile(event.currentTarget.files?.[0])} /></label>
    {preview && (photo
      ? <img width={144} height={96} style={{ objectFit: "contain" }} src={preview} alt="Prévia da foto selecionada" />
      : <video width={144} height={96} src={preview} controls playsInline preload="metadata" aria-label="Prévia do vídeo selecionado" />)}
  </>;
}
