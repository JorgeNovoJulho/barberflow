"use client";

import Link from "next/link";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="container section">
    <div className="card panel-form" role="alert">
      <h1>Esta página não carregou</h1>
      <p>Tente carregar novamente ou volte ao painel.</p>
      {error.digest && <p>Referência do erro <code>{error.digest}</code></p>}
      <div className="account-links">
        <button className="primary" type="button" onClick={reset}>Tentar novamente</button>
        <Link className="secondary" href="/painel">Voltar ao painel</Link>
      </div>
    </div>
  </section>;
}
