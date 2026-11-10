"use client";

import { useEffect, useRef, useState } from "react";
import { profileImageAccept } from "../../lib/profile-image-limits";

export function PostPhotoPicker({ replacing }: { replacing: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files]);

  function sync(next: File[]) {
    const transfer = new DataTransfer();
    next.forEach(file => transfer.items.add(file));
    if (input.current) input.current.files = transfer.files;
    setFiles(next);
  }

  return <div className="post-photo-picker">
    <label>{replacing ? "Substituir fotos" : "Enviar fotos"} (até 3, de 5 MB cada)
      <input ref={input} type="file" name="photo" multiple accept={profileImageAccept} onChange={event => {
        const selected = [...(event.currentTarget.files ?? [])];
        const combined = [...files];
        for (const file of selected) {
          if (!combined.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) combined.push(file);
        }
        if (combined.length > 3 || combined.some(file => file.size > 5 * 1024 * 1024)) {
          sync(files);
          setError("Selecione até três arquivos de 5 MB cada.");
          return;
        }
        setError("");
        sync(combined);
      }} />
    </label>
    {error && <p role="alert">{error}</p>}
    {files.length > 0 && <ul className="post-photo-previews">{files.map((file,index) => <li key={file.name+file.lastModified+index}>
      {previews[index] && <img src={previews[index]} alt="" />}
      <span>{file.name}</span>
      <button className="secondary" type="button" aria-label={`Remover ${file.name}`} onClick={() => {
        setError("");
        sync(files.filter((_,position) => position !== index));
      }}>Remover</button>
    </li>)}</ul>}
  </div>;
}
