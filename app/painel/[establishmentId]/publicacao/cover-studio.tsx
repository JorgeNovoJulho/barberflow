"use client";

import { useEffect, useRef, useState } from "react";
import { productImageLimit, productImageTypes } from "../../../../lib/product-media";
import {
  coverFonts, coverTextY, coverHeight, coverTemplates, coverWidth, drawCover, newCoverDesign, type PhotoLayer, type TextLayer,
} from "./cover-design";
import { uploadProfileMedia } from "./upload";

const textNames = ["Chamada", "Nome no banner", "Subtítulo", "Contato ou rodapé"];

function loadPhoto(source: string): Promise<HTMLImageElement | null> {
  if (!source) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

export function CoverStudio({ shop, name }: { shop: string; name: string }) {
  const studio = useRef<HTMLDetailsElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const objectUrls = useRef(new Set<string>());
  const [opened, setOpened] = useState(false);
  const [design, setDesign] = useState(() => newCoverDesign(0, name));
  const [guides, setGuides] = useState(true);
  const [focused, setFocused] = useState("");
  const model = coverTemplates[design.template];
  const [rendered, setRendered] = useState<typeof design | null>(null);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [renderError, setRenderError] = useState("");

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  const sourceKey = JSON.stringify(design.photos.map((photo) => photo.source));
  const [loaded, setLoaded] = useState<{ key: string; images: (HTMLImageElement | null)[] } | null>(null);
  useEffect(() => {
    if (!opened) return;
    let active = true;
    const sources: string[] = JSON.parse(sourceKey);
    void Promise.all(sources.map(loadPhoto)).then((images) => {
      if (active) setLoaded({ key: sourceKey, images });
    });
    return () => { active = false; };
  }, [opened, sourceKey]);

  useEffect(() => {
    if (!opened || !canvas.current || loaded?.key !== sourceKey) return;
    const missing = design.photos.some((photo, index) => photo.source && !loaded.images[index]);
    drawCover(canvas.current, design, loaded.images);
    setRenderError(missing ? "Uma foto não pôde ser aberta. Troque ou remova a foto antes de exportar." : "");
    setRendered(design);
  }, [opened, design, loaded, sourceKey]);

  function selectTemplate(template: number, form: HTMLFormElement | null) {
    const nameField = form?.elements.namedItem("name");
    const currentName = nameField instanceof HTMLInputElement ? nameField.value.trim() : name;
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    setDesign(newCoverDesign(template, currentName || name));
    setFocused("");
    setStatus("");
  }

  function changeText(index: number, patch: Partial<TextLayer>) {
    setFocused("T" + (index + 1));
    setDesign((current) => ({
      ...current, texts: current.texts.map((layer, i) => i === index ? { ...layer, ...patch } : layer),
    }));
  }

  function changePhoto(index: number, patch: Partial<PhotoLayer>) {
    setFocused("F" + (index + 1));
    if (patch.source !== undefined) {
      const previous = design.photos[index].source;
      if (objectUrls.current.delete(previous)) URL.revokeObjectURL(previous);
    }
    setDesign((current) => ({
      ...current, photos: current.photos.map((layer, i) => i === index ? { ...layer, ...patch } : layer),
    }));
  }

  async function exportCover(form: HTMLFormElement | null, apply: boolean) {
    const destination = form?.elements.namedItem("cover");
    if (!canvas.current || rendered !== design || renderError || working || (apply && !(destination instanceof HTMLInputElement))) return;
    setWorking(true);
    setStatus(apply ? "Enviando capa…" : "Preparando PNG…");
    if (apply && studio.current) studio.current.dataset.mediaPending = "true";
    try {
      const preview = canvas.current;
      const blob = await new Promise<Blob | null>((resolve) => preview.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG");
      if (apply && destination instanceof HTMLInputElement) {
        if (blob.size > productImageLimit) {
          setStatus("O PNG excedeu 5 MB. Use fotos mais leves ou baixe a imagem para compactar.");
          return;
        }
        const data = new FormData();
        data.set("media", new File([blob], "capa-barberflow.png", { type: "image/png" }));
        const url = await uploadProfileMedia(shop, "cover-studio", data);
        if (!url) throw new Error("Upload");
        destination.value = url;
        setStatus("Capa enviada. Clique em Salvar publicação e regras para aplicar.");
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "capa-barberflow.png";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus("PNG de 1600 × 600 px pronto para baixar.");
      }
    } catch {
      setStatus(apply ? "Não foi possível enviar a capa. Tente novamente ou baixe o PNG." : "Não foi possível gerar o PNG. Tente novamente.");
    } finally {
      if (studio.current) delete studio.current.dataset.mediaPending;
      setWorking(false);
    }
  }

  return <details ref={studio} className="cover-studio" onToggle={(event) => {
    if (event.currentTarget.open && !opened) {
      selectTemplate(0, event.currentTarget.closest("form"));
      setOpened(true);
    }
  }}>
    <summary>Criar capa a partir de um modelo</summary>
    {opened && <fieldset disabled={working}>
      <legend>Estúdio de capas</legend>
      <p>Escolha um modelo e personalize as cores, os textos e o recorte de cada foto. O PNG tem 1600 × 600 px.</p>
      <div className="cover-models" role="group" aria-label="Modelos de capa">
        {coverTemplates.map((model, index) => <button key={model.name} type="button" className="secondary"
          aria-pressed={design.template === index} onClick={(event) => {
            if (design.template !== index) selectTemplate(index, event.currentTarget.form);
          }}>
          <span aria-hidden="true" style={{ background: `linear-gradient(115deg, ${model.background} 46%, ${model.accent} 47% 51%, ${model.secondary} 52%)` }} />
          {model.name}
        </button>)}
      </div>
      <label className="cover-guide-toggle"><input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} /> Mostrar marcadores na prévia</label>
      <div className="cover-stage">
      <canvas ref={canvas} width={coverWidth} height={coverHeight} role="img"
        aria-label={`Prévia do modelo ${coverTemplates[design.template].name} para ${design.texts[1].value || name}`} />
      {guides && <div className="cover-markers" aria-hidden="true">
        {coverTextY.map((y, index) => {
          const tag = "T" + (index + 1);
          return <span key={tag} data-active={focused === tag} style={{ left: (model.left ? 690 : 85) / 16 + "%", top: y / 6 + "%" }}>{tag}</span>;
        })}
        {model.frames.map(([x, y, w, h], index) => {
          const tag = "F" + (index + 1);
          return <span key={tag} data-active={focused === tag} style={{ left: (x + w / 2) / 16 + "%", top: (y + h / 2) / 6 + "%" }}>{tag}</span>;
        })}
      </div>}
      </div>
      <p className="cover-preview-note">A imagem inteira aparece na página pública, inclusive no celular.</p>
      <div className="account-links">
        <button type="button" className="primary" disabled={rendered !== design || !!renderError}
          onClick={(event) => void exportCover(event.currentTarget.form, true)}>Usar como capa</button>
        <button type="button" className="secondary" disabled={rendered !== design || !!renderError}
          onClick={(event) => void exportCover(event.currentTarget.form, false)}>Baixar PNG</button>
      </div>
      <p role="status">{status || renderError}</p>
      <div className="cover-controls">
        <details open data-cover-section="colors">
          <summary>Cores do modelo</summary>
          <div className="cover-fields">
            {([["background", "Fundo"], ["secondary", "Fundo secundário"], ["accent", "Molduras e detalhes"]] as const).map(([key, label]) =>
              <label key={key}>{label} <input type="color" value={design[key]}
                onChange={(event) => setDesign({ ...design, [key]: event.currentTarget.value })} /></label>)}
          </div>
        </details>
        <details data-cover-section="effects">
          <summary>Efeitos</summary>
          <div className="cover-fields">
            <label>Luz do fundo <select value={design.effect} onChange={(event) => setDesign({ ...design, effect: event.target.value as typeof design.effect })}>
              <option value="none">Original</option><option value="glow">Brilho central</option><option value="vignette">Bordas escurecidas</option>
            </select></label>
            <label><input type="checkbox" checked={design.shadow} onChange={(event) => setDesign({ ...design, shadow: event.target.checked })} /> Sombra no texto</label>
          </div>
        </details>
        <details data-cover-section="text">
          <summary>Textos e fontes</summary>
          {design.texts.map((layer, index) => <div key={index} className="cover-layer">
            <label>T{index + 1} · {textNames[index]} <input value={layer.value} maxLength={120}
              onChange={(event) => changeText(index, { value: event.currentTarget.value })} /></label>
            <div className="cover-fields">
              <label>Fonte <select value={layer.font} onChange={(event) => changeText(index, { font: event.currentTarget.value as TextLayer["font"] })}>
                {Object.keys(coverFonts).map((font) => <option key={font} value={font}>{font.charAt(0).toUpperCase() + font.slice(1)}</option>)}
              </select></label>
              <label>Tamanho · {layer.size} px <input type="range" min={18} max={index === 1 ? 150 : 64} value={layer.size}
                onChange={(event) => changeText(index, { size: Number(event.currentTarget.value) })} /></label>
              <label>Cor do texto <input type="color" value={layer.color} onChange={(event) => changeText(index, { color: event.currentTarget.value })} /></label>
            </div>
          </div>)}
        </details>
        <details data-cover-section="photos">
          <summary>Imagens e recortes</summary>
          {design.photos.map((photo, index) => <div key={index} className="cover-layer">
            <label>F{index + 1} · Foto {index + 1} <input type="file" accept={productImageTypes.join(",")} onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              if (!productImageTypes.includes(file.type) || !file.size || file.size > productImageLimit) {
                setStatus("Escolha uma imagem JPEG, PNG, WebP ou AVIF de até 5 MB.");
                return;
              }
              const source = URL.createObjectURL(file);
              objectUrls.current.add(source);
              changePhoto(index, { source, zoom: 100, x: 50, y: 50 });
              setStatus("");
            }} /></label>
            {photo.source && <>
              <img className="publication-media-thumb" src={photo.source} alt={`Prévia da foto ${index + 1}`} />
              <div className="cover-fields">
                {([["zoom", "Zoom", 100, 250], ["x", "Posição horizontal", 0, 100], ["y", "Posição vertical", 0, 100]] as const).map(([key, label, min, max]) =>
                  <label key={key}>{label} <input type="range" min={min} max={max} value={photo[key]}
                    onChange={(event) => changePhoto(index, { [key]: Number(event.currentTarget.value) })} /></label>)}
              </div>
              <button type="button" className="secondary" onClick={() => { changePhoto(index, { source: "" }); setStatus(""); }}>Remover foto {index + 1}</button>
            </>}
          </div>)}
        </details>
      </div>
    </fieldset>}
  </details>;
}
