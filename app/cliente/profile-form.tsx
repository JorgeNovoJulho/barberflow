"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { checkSocialUsername, saveSocialProfile } from "./actions";

const themes = { claro: "Claro", rosa: "Rosa", verde: "Verde", azul: "Azul" };
const networks = ["Instagram", "Facebook", "YouTube", "TikTok"];
type Profile = { username: string; theme: string; links: Record<string, string>; revision: number };
type Feedback = { error?: string; suggestions?: string[]; stale?: boolean };

function ImageField({ name, label, saved }: { name: string; label: string; saved?: string }) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="profile-image-field">
    <label>{label} <input type="file" name={name} accept="image/jpeg,image/png,image/webp,image/avif"
      onChange={event => {
        setPreview(undefined);
        setFile(event.currentTarget.files?.[0]);
      }} /></label>
    {(preview || saved) && <img className={name === "avatar" ? "social-avatar" : "social-banner"}
      src={preview || saved} alt={preview ? "Prévia da imagem selecionada" : "Imagem salva"} />}
    {name === "banner" && saved && !file && <label><input type="checkbox" name="remove_banner" /> Remover banner salvo</label>}
  </div>;
}

export function SocialProfileForm({ profile, avatar, banner, setup }: {
  profile?: Profile; avatar?: string; banner?: string; setup: boolean;
}) {
  const [username, setUsername] = useState(profile?.username ?? "");
  const [feedback, setFeedback] = useState<Feedback>({});
  const [availability, setAvailability] = useState("");
  const [pending, start] = useTransition();
  const latest = useRef(0);
  const submitting = useRef(false);
  const saving = pending && submitting.current;
  function choose(name: string) {
    latest.current++;
    setUsername(name);
    setFeedback({});
    setAvailability("");
  }
  function check() {
    const request = ++latest.current;
    setFeedback({});
    setAvailability("Verificando nome…");
    start(async () => {
      try {
        const result = await checkSocialUsername(username);
        if (request !== latest.current) return;
        setAvailability(result.available ? "Nome disponível." : "");
        if (!result.available) setFeedback({ error: result.error ?? "Este nome já está em uso.", suggestions: result.suggestions });
      } catch {
        if (request === latest.current) {
          setAvailability("");
          setFeedback({ error: "Não foi possível verificar o nome. Tente novamente." });
        }
      }
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || feedback.stale) return;
    const form = new FormData(event.currentTarget);
    submitting.current = true;
    latest.current++;
    setAvailability("");
    setFeedback({});
    start(async () => {
      try {
        const result = await saveSocialProfile(form);
        if ("saved" in result) {
          window.location.assign("/cliente?aba=perfil&estado=salvo");
          return;
        }
        setFeedback(result);
      } catch {
        setFeedback({ error: "Não foi possível confirmar o salvamento. Confira o perfil e tente novamente." });
      } finally {
        submitting.current = false;
      }
    });
  }
  return <form className="account-form card panel-form social-profile-form" method="post" onSubmit={submit} aria-busy={saving}>
    <h2>{setup ? "Complete seu perfil" : "Configurações do perfil"}</h2>
    <fieldset disabled={saving}>
      <input type="hidden" name="revision" value={profile?.revision ?? "new"} />
      <label>Nome de usuário <input name="username" required minLength={3} maxLength={40} value={username}
        onChange={event => choose(event.target.value)} /></label>
      <small>Use letras sem acento, números, ponto, hífen ou sublinhado.</small>
      <button className="secondary" type="button" onClick={check} disabled={pending}>Verificar disponibilidade</button>
      {availability && <p role="status">{availability}</p>}
      {feedback.suggestions?.length ? <div className="account-links" aria-label="Nomes sugeridos">
        {feedback.suggestions.map(name => <button className="secondary" type="button" key={name} onClick={() => choose(name)}>{name}</button>)}
      </div> : null}
      <ImageField name="avatar" label="Foto de perfil" saved={avatar} />
      <ImageField name="banner" label="Banner (opcional)" saved={banner} />
      <small>JPG, PNG, WebP ou AVIF, até 2 MB e 4096 pixels por lado.</small>
      {networks.map(network => <label key={network}>{network} <input type="url" name={network} maxLength={300} defaultValue={profile?.links?.[network]} /></label>)}
      <label>Tema <select name="theme" defaultValue={profile?.theme ?? "claro"}>{Object.entries(themes).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <button className="primary" disabled={feedback.stale}>{saving ? "Enviando imagens e salvando…" : "Salvar perfil"}</button>
    </fieldset>
    {feedback.error && <p role="alert">{feedback.error}</p>}
    {feedback.stale && <a href="/cliente?aba=perfil">Abrir versão mais recente</a>}
    {saving && <p role="status">Aguarde a confirmação do servidor.</p>}
  </form>;
}
