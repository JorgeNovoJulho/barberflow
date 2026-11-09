"use client";

import { useRef, useState } from "react";
import { businessDays } from "../../../../lib/business-profile";
import { productImageTypes, productVideoTypes } from "../../../../lib/product-media";
import { uploadProfileMedia } from "./upload";

function field(form: HTMLFormElement | null, name: string) {
  const element = form?.elements.namedItem(name);
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : null;
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

export function ProfileMediaUpload({ shop, target }: { shop: string; target: "logo" | "cover" | "video" | "gallery" }) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const video = target === "video";
  return <div>
    <label>{target === "gallery" ? "Enviar fotos da galeria" : video ? "Enviar vídeo" : target === "logo" ? "Enviar logotipo" : "Enviar capa"}
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
          setPending(true);
          setStatus("Enviando…");
          let saved = 0;
          try {
            for (const file of files) {
              const data = new FormData();
              data.set("media", file);
              const slot = target === "gallery"
                ? Array.from({ length: 8 }, (_, index) => `gallery-${index + 1}`)
                  .find((candidate) => !links.some((link) => link.split("?")[0].endsWith(`/${shop}/${candidate}`)))
                : target;
              if (!slot) break;
              const url = await uploadProfileMedia(shop, slot, data);
              if (!url) break;
              if (target === "gallery") {
                links.push(url);
                destination.value = links.join("\n");
              } else destination.value = url;
              saved++;
            }
          } catch {
            // The feedback below keeps successfully uploaded files in the form.
          } finally {
            setPending(false);
            setStatus(saved === files.length ? "Arquivo enviado. Salve a publicação para aplicar."
              : `${saved} de ${files.length} enviados. Confira o formato e o limite de ${video ? 20 : 5} MB por arquivo.`);
          }
        }} />
    </label>
    <p role="status">{status}</p>
  </div>;
}
