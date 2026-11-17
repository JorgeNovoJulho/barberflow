"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { productImageLimit, productImageTypes, productVideoTypes } from "../../../../lib/product-media";
import { saveServiceCategory } from "./actions";
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
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const photo = kind === "photo";
  const types = photo ? productImageTypes : productVideoTypes;
  const limit = photo ? productImageLimit : serviceVideoLimit;

  useEffect(() => {
    const urls = files.slice(0, 5)
      .filter(file => file.size > 0 && file.size <= limit && types.includes(file.type))
      .map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files, limit, types]);

  return <>
    <label>{label} <input type="file" name={kind} accept={types.join(",")} multiple={photo}
      onChange={event => setFiles(Array.from(event.currentTarget.files ?? []))} /></label>
    {previews.map((preview, index) => photo
      ? <img key={preview} width={144} height={96} style={{ objectFit: "contain" }} src={preview} alt={`Prévia da foto ${index + 1}`} />
      : <video key={preview} width={144} height={96} src={preview} controls playsInline preload="metadata" aria-label="Prévia do vídeo selecionado" />)}
  </>;
}

export function ServiceCategoryField({ shop, categories, initial }: { shop: string; categories: string[]; initial: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState(initial);
  const [draft, setDraft] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const options = [...new Set([...categories, ...added, initial].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  async function save() {
    if (pending || !draft.trim()) return;
    setPending(true);
    setFeedback("");
    try {
      const result = await saveServiceCategory(shop, draft);
      if (!result.name) {
        setFeedback(result.error ?? "Não foi possível salvar a categoria.");
        router.refresh();
        return;
      }
      setAdded(previous => [...previous, result.name]);
      setSelected(result.name);
      setDraft("");
      setFeedback("Categoria salva.");
      router.refresh();
    } catch {
      setFeedback("Não foi possível confirmar o salvamento. Confira a lista e tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return <>
    <label>Categoria
      <select name="category" value={selected} onChange={event => setSelected(event.currentTarget.value)}>
        <option value="">Sem categoria</option>
        {options.map(category => <option key={category}>{category}</option>)}
      </select>
    </label>
    <div className="account-links">
      <label>Nova categoria <input maxLength={80} value={draft} disabled={pending}
        onChange={event => setDraft(event.currentTarget.value)}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void save(); } }} /></label>
      <button className="secondary finance-tab command-action" data-tone="green" type="button"
        disabled={pending || !draft.trim()} onClick={save}>{pending ? "Salvando categoria…" : "Salvar categoria"}</button>
    </div>
    {feedback && <p role="status">{feedback}</p>}
  </>;
}
