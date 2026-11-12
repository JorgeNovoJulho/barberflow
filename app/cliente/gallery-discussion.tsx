"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { galleryComment, galleryVote, loadGalleryFeed, reportGalleryComment, type GalleryComment, type GalleryFeed } from "./gallery-feed-actions";

export function GalleryDiscussion({ post, children }: { post: string; children: React.ReactNode }) {
  const [feed, setFeed] = useState<GalleryFeed | null>(null);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<GalleryComment | null>(null);
  const [body, setBody] = useState("");
  const [busy, start] = useTransition();
  const field = useId();

  useEffect(() => {
    let current = true;
    void loadGalleryFeed(post).then((data) => {
      if (!current) return;
      setFeed(data);
      if (!data) setMessage("Não foi possível carregar a conversa.");
    }).catch(() => { if (current) setMessage("Não foi possível carregar a conversa."); });
    return () => { current = false; };
  }, [post]);

  function update(action: () => Promise<boolean>, success?: string, after?: () => void) {
    start(async () => {
      try {
        if (!await action()) { setMessage("Não foi possível concluir esta ação."); return; }
        after?.();
        setMessage(success ?? "");
        const result = await loadGalleryFeed(post);
        if (result) setFeed(result);
      } catch { setMessage("A conexão falhou. Tente novamente."); }
    });
  }

  function votes(item: Pick<GalleryComment, "likes" | "dislikes" | "vote">, comment: string | null) {
    return <>
      <button type="button" className="secondary" disabled={busy} aria-pressed={item.vote === 1}
        onClick={() => update(() => galleryVote(post, comment, 1))}>Curtir · {item.likes}</button>
      <button type="button" className="secondary" disabled={busy} aria-pressed={item.vote === -1}
        onClick={() => update(() => galleryVote(post, comment, -1))}>Negativar · {item.dislikes}</button>
    </>;
  }

  function renderComment(comment: GalleryComment) {
    return <article className="gallery-feed-comment" key={comment.id}>
      <div className="subscription-business">
        {comment.avatar ? <img src={comment.avatar} alt="" width={44} height={44} loading="lazy" />
          : <span aria-hidden="true">{comment.name.slice(0, 2).toUpperCase()}</span>}
        <strong>{comment.name}</strong>
      </div>
      <p>{comment.body}</p>
      <div className="account-links">
        {votes(comment, comment.id)}
        {!comment.parent && <button type="button" className="secondary" onClick={() => {
          setReply(comment);
          document.getElementById(field)?.focus();
        }}>Responder</button>}
      </div>
      <details><summary>Denunciar comentário</summary>
        <form className="account-form" onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const reason = String(new FormData(form).get("reason") ?? "");
          update(() => reportGalleryComment(comment.id, reason), "Denúncia enviada à moderação.", () => form.reset());
        }}>
          <label>Motivo <input name="reason" required minLength={3} maxLength={500} /></label>
          <button className="secondary" disabled={busy}>Enviar denúncia</button>
        </form>
      </details>
    </article>;
  }

  const comments = feed?.comments ?? [];
  const roots = new Set(comments.filter(({ parent }) => !parent).map(({ id }) => id));
  return <div className="gallery-feed-layout">
    <div className="gallery-feed-main">
      {children}
      {feed && <div className="gallery-feed-controls">
        <div className="account-links">{votes(feed, null)}
          <button className="secondary" type="button" onClick={() => document.getElementById(field)?.focus()}>Comentar</button>
        </div>
        <form className="account-form" onSubmit={(event) => {
          event.preventDefault();
          update(() => galleryComment(post, reply?.id ?? null, body), "Comentário publicado.", () => { setBody(""); setReply(null); });
        }}>
          {reply && <p>Respondendo a {reply.name} <button type="button" className="secondary" onClick={() => setReply(null)}>Cancelar resposta</button></p>}
          <label>{reply ? "Sua resposta" : "Seu comentário"} <textarea id={field} maxLength={500} required rows={2} value={body}
            onChange={(event) => setBody(event.target.value)} /></label>
          <button className="primary" disabled={busy}>Publicar {reply ? "resposta" : "comentário"}</button>
        </form>
      </div>}
      {message && <p role="status">{message}</p>}
    </div>
    <aside className="gallery-feed-thread" aria-label="Comentários da publicação">
      <h3>Comentários</h3>
      {!feed && !message && <p>Carregando conversa…</p>}
      {feed && !comments.length && <p>Nenhum comentário ainda.</p>}
      {comments.filter(({ parent }) => !parent || !roots.has(parent)).map((comment) => <div key={comment.id}>
        {renderComment(comment)}
        {comments.filter(({ parent }) => parent === comment.id).map((child) => <div className="gallery-feed-reply" key={child.id}>{renderComment(child)}</div>)}
      </div>)}
    </aside>
  </div>;
}
