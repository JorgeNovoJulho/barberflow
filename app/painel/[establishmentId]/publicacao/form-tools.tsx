"use client";

import { useRef, useState, type ReactNode } from "react";
import { businessDays, httpsUrl, publicProfileColor, publicProfileColors } from "../../../../lib/business-profile";
import { productImageTypes, productVideoTypes } from "../../../../lib/product-media";
import { uploadProfileMedia } from "./upload";

function field(form: HTMLFormElement | null, name: string) {
  const element = form?.elements.namedItem(name);
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : null;
}

export function PublicationForm({ children, action }: { children: ReactNode; action: (form: FormData) => Promise<void> }) {
  const [waiting, setWaiting] = useState(false);
  return <form className="account-form publication-form" action={action} onSubmit={(event) => {
    if (event.currentTarget.querySelector("[data-media-pending]")) {
      event.preventDefault();
      setWaiting(true);
    }
  }}>
    {children}
    {waiting && <p role="status">Aguarde o envio da mídia terminar e salve novamente.</p>}
  </form>;
}

export function PostalLookup({ initial }: { initial?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const edited = useRef(false);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  async function lookup() {
    const source = input.current;
    const digits = source?.value.replace(/\D/g, "") ?? "";
    if (!source || digits.length !== 8) {
      setStatus("Informe os oito dígitos do CEP.");
      return;
    }
    const version = ++request.current;
    setPending(true);
    setStatus("Consultando CEP…");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error("Consulta indisponível");
      const address = await response.json();
      if (version !== request.current || source.value.replace(/\D/g, "") !== digits) return;
      if (address.erro) {
        setStatus("CEP não encontrado. Confira os dígitos ou preencha o endereço manualmente.");
        return;
      }
      for (const [name, value] of Object.entries({
        address: address.logradouro, neighborhood: address.bairro, city: address.localidade, region: address.uf,
      })) {
        const target = field(source.form, name);
        if (target && typeof value === "string" && value) target.value = value;
      }
      source.value = digits.slice(0, 5) + "-" + digits.slice(5);
      setStatus("Endereço consultado. Confira os dados e informe o número e o complemento.");
    } catch {
      if (version === request.current) setStatus("Não foi possível consultar o CEP. Você pode preencher o endereço manualmente.");
    } finally {
      if (version === request.current) setPending(false);
    }
  }

  return <div>
    <label>CEP <input ref={input} name="postalCode" inputMode="numeric" maxLength={9} defaultValue={initial}
      autoComplete="postal-code" onChange={() => {
        edited.current = true;
        request.current++;
        setPending(false);
        setStatus("");
      }} onBlur={() => { if (edited.current && input.current?.value.replace(/\D/g, "").length === 8 && !status && !pending) void lookup(); }} /></label>
    <button type="button" className="secondary" disabled={pending} onClick={lookup}>Buscar CEP</button>
    <p role="status">{status}</p>
  </div>;
}

export function CopyHours({ day }: { day: number }) {
  const [copied, setCopied] = useState(false);
  return <>
    <button type="button" className="secondary" onClick={(event) => {
      const form = event.currentTarget.form;
      for (const [target] of businessDays.entries()) {
        if (target === day) continue;
        for (const key of ["open", "start", "end", "break-start", "break-end"]) {
          const from = field(form, `${key}-${day}`);
          const to = field(form, `${key}-${target}`);
          if (from instanceof HTMLInputElement && to instanceof HTMLInputElement) {
            if (key === "open") to.checked = from.checked;
            else to.value = from.value;
          }
        }
      }
      setCopied(true);
    }}>Copiar para os outros dias</button>
    {copied && <p role="status">Horários copiados. Salve para aplicar.</p>}
  </>;
}

export function GalleryEditor({ shop, initial }: { shop: string; initial: string[] }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [links, setLinks] = useState(initial);
  const [uploading, setUploading] = useState(false);
  function update(index: number, nextIndex?: number) {
    const next = [...links];
    const [item] = next.splice(index, 1);
    if (nextIndex !== undefined) next.splice(nextIndex, 0, item);
    if (input.current) input.current.value = next.join("\n");
    setLinks(next);
  }
  return <>
    <label>Galeria do local (até 8 links HTTPS, um por linha)
      <textarea ref={input} name="gallery" rows={4} defaultValue={initial.join("\n")} readOnly={uploading}
        onChange={(event) => setLinks(event.currentTarget.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} />
    </label>
    <ProfileMediaUpload shop={shop} target="gallery" onGalleryChange={setLinks} onPendingChange={setUploading} />
    {links.length > 0 && <ol className="cards">{links.slice(0, 8).map((link, index) => <li className="card" key={index}>
      {httpsUrl(link) ? <img className="landing-card-photo" src={link} loading="lazy" alt={`Foto ${index + 1} da galeria`} /> : <p>Link inválido.</p>}
      <div className="account-links">
        <button type="button" className="secondary" disabled={uploading || index === 0} onClick={() => update(index, index - 1)}>Mover para a esquerda</button>
        <button type="button" className="secondary" disabled={uploading || index + 1 === links.length} onClick={() => update(index, index + 1)}>Mover para a direita</button>
        <button type="button" className="secondary" disabled={uploading} onClick={() => update(index)}>Remover foto</button>
      </div>
    </li>)}</ol>}
  </>;
}

export function ProfileColors({ initial }: { initial?: string }) {
  const [selected, setSelected] = useState(() => publicProfileColor(initial));
  const name = publicProfileColors.find(({ value }) => value === selected)?.name ?? "Cor já salva";
  return <fieldset className="public-color-picker">
    <legend>Cor da página pública</legend>
    <div className="public-color-options">
      {publicProfileColors.map(({ name, value }) => <button key={value} type="button"
        className="secondary" aria-pressed={value === selected} onClick={() => setSelected(value)}>
        <span aria-hidden="true" style={{ background: value }} />{name}
      </button>)}
    </div>
    <input type="hidden" name="color" value={selected} />
    <div className="public-color-preview" style={{ borderColor: selected }}>
      <strong>Prévia · {name}</strong>
      <span style={{ background: selected }}>Agendar horário</span>
    </div>
  </fieldset>;
}

export function ProfileMediaUpload({ shop, target, professional, onGalleryChange, onPendingChange, initialPreview }: {
  shop: string; target: "logo" | "cover" | "video" | "gallery" | "photo"; professional?: string;
  initialPreview?: string;
  onGalleryChange?: (links: string[]) => void; onPendingChange?: (pending: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(() => httpsUrl(initialPreview));
  const video = target === "video";
  return <div>
    <label>{target === "gallery" ? "Enviar fotos da galeria" : video ? "Enviar vídeo" : target === "logo" ? "Enviar logotipo" : target === "photo" ? "Enviar foto do profissional" : "Enviar capa"}
      <input type="file" multiple={target === "gallery"} disabled={pending}
        accept={(video ? productVideoTypes : productImageTypes).join(",")}
        onChange={async (event) => {
          const picker = event.currentTarget;
          const destination = field(picker.form, target);
          const files = Array.from(picker.files ?? []);
          picker.value = "";
          if (!destination || !files.length) return;
          const links = target === "gallery" ? destination.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
          if (links.length + files.length > 8) {
            setStatus("A galeria aceita até oito fotos.");
            return;
          }
          picker.dataset.mediaPending = "true";
          setPending(true);
          onPendingChange?.(true);
          setStatus("Enviando…");
          let saved = 0;
          try {
            for (const file of files) {
              const data = new FormData();
              data.set("media", file);
              const slot = target === "gallery"
                ? Array.from({ length: 8 }, (_, index) => `gallery-${index + 1}`)
                  .find((candidate) => !links.some((link) => link.split("?")[0].endsWith(`/${shop}/${candidate}`)))
                : target === "photo" ? `professional-${professional}` : target;
              if (!slot) break;
              const url = await uploadProfileMedia(shop, slot, data);
              if (!url) break;
              if (target === "gallery") {
                links.push(url);
                destination.value = links.join("\n");
              } else { destination.value = url; setPreview(url); }
              saved++;
            }
          } catch {
            // The feedback below keeps successfully uploaded files in the form.
          } finally {
            delete picker.dataset.mediaPending;
            setPending(false);
            onPendingChange?.(false);
            if (target === "gallery") onGalleryChange?.(links);
            setStatus(saved === files.length ? (target === "photo" ? "Foto enviada. Salve o profissional para aplicar." : "Arquivo enviado. Salve a publicação para aplicar.")
              : `${saved} de ${files.length} enviados. Confira o formato e o limite de ${video ? 20 : 5} MB por arquivo.`);
          }
        }} />
    </label>
    {preview && (video ? <video className="publication-media-thumb" src={preview} controls preload="metadata" />
      : <img className="publication-media-thumb" src={preview} alt={target === "logo" ? "Prévia do logotipo" : "Prévia da capa"} />)}
    <p role="status">{status}</p>
  </div>;
}
