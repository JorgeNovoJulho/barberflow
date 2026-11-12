import Link from "next/link";
import { requireMaster } from "../../../lib/master";
import { SubmitButton } from "../../auth/submit";
import { MasterCards, MasterTabs } from "../master-ui";
import { moderateFeedComment, moderateReview } from "./actions";

type Item = {
  id: string; shop: string; slug: string | null; rating: number; comment: string; author: string;
  hidden: boolean; pending_count: number; reasons: string[]; last_decision: string | null;
};

const decisions: Record<string, string> = { hide: "Ocultada", restore: "Restaurada", dismiss: "Denúncias arquivadas" };

export default async function ReviewModeration({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const supabase = await requireMaster("/gestao-master/avaliacoes");
  const [{ data, error }, reports] = await Promise.all([
    supabase.rpc("barberflow_review_queue"),
    supabase.rpc("barberflow_feed_comment_queue"),
  ]);
  const comments = (reports.data ?? []) as { id: string; post: string; body: string; reasons: string[] }[];
  const { estado } = await searchParams;
  const items = (data ?? []) as Item[];

  return <section className="container section">
    <MasterTabs current="/gestao-master/avaliacoes" />
    <h1>Moderação</h1>
    {!error && <MasterCards items={[["Avaliações na fila",items.length],
      ["Denúncias pendentes",items.reduce((total,item) => total + Number(item.pending_count),0)],
      ["Avaliações ocultas",items.filter(item => item.hidden).length]]} />}
    {estado === "salvo" && <p role="status">Decisão registrada.</p>}
    {estado === "erro" && <p role="alert">Não foi possível registrar a decisão. Confira a situação da denúncia.</p>}
    <section id="comentarios-denunciados">
      <h2>Comentários do Feed denunciados</h2>
      {reports.error ? <p role="alert">Não foi possível carregar as denúncias.</p> : comments.length ? <ul className="cards">
        {comments.map((comment) => <li className="card" key={comment.id}>
          <blockquote>{comment.body}</blockquote>
          <details><summary>Motivos da denúncia · {comment.reasons.length}</summary>
            <ul>{comment.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
          </details>
          <div className="account-links">
            <form action={moderateFeedComment.bind(null, comment.id, true)}><SubmitButton>Remover comentário e respostas</SubmitButton></form>
            <form action={moderateFeedComment.bind(null, comment.id, false)}><SubmitButton>Dispensar denúncias</SubmitButton></form>
            <Link href={"/cliente?foto=" + comment.post}>Abrir publicação</Link>
          </div>
        </li>)}
      </ul> : <p>Nenhum comentário denunciado.</p>}
    </section>
    <h2>Avaliações</h2>
    {error ? <p role="alert">Não foi possível carregar a fila.</p> : items.length ? <ul className="cards">
      {items.map((item) => <li className="card" key={item.id}>
        <h2>{item.shop}</h2>
        <p>{item.author} · {item.rating}/5 · {item.hidden ? "Oculta" : "Visível"}</p>
        {item.comment && <blockquote>{item.comment}</blockquote>}
        <p>Denúncias pendentes: {item.pending_count}</p>
        {item.last_decision && <p>Última decisão: {decisions[item.last_decision]}</p>}
        <details><summary>Motivos informados</summary><ul>{item.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>
        <div className="account-links">
          {item.hidden && <form action={moderateReview.bind(null, item.id, "restore")}><SubmitButton>Restaurar avaliação</SubmitButton></form>}
          {!item.hidden && item.pending_count > 0 && <>
            <form action={moderateReview.bind(null, item.id, "hide")}><SubmitButton>Ocultar avaliação</SubmitButton></form>
            <form action={moderateReview.bind(null, item.id, "dismiss")}><SubmitButton>Arquivar denúncias</SubmitButton></form>
          </>}
          {item.slug && <Link href={`/estabelecimento/${item.slug}#avaliacoes`}>Abrir perfil</Link>}
        </div>
      </li>)}
    </ul> : <p>Nenhuma avaliação denunciada.</p>}
  </section>;
}
