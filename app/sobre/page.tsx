import type { Metadata } from "next";
import { connection } from "next/server";
import { legalIdentity } from "../../lib/auth-path";
import { compareVersions, currentRelease, getReleaseInformation } from "../../lib/releases";

export const metadata: Metadata = { title: "Sobre" };

export default async function AboutPage() {
  await connection();
  const release = await getReleaseInformation();
  const identity = legalIdentity();
  const developer = process.env.BARBERFLOW_DEVELOPER_NAME?.trim() || identity?.operator || "Equipe TOP BARBER";
  const contact = process.env.BARBERFLOW_DEVELOPER_EMAIL?.trim() || identity?.email;
  const pending = release.available && release.pending;

  return <section className="container section">
    <header className="module-heading">
      <p className="eyebrow">TOP BARBER</p>
      <h1>Sobre</h1>
      <p>Informações do sistema e histórico de atualizações.</p>
    </header>

    <div className="checkout-columns">
      <section className="card panel-form" aria-labelledby="developer-title">
        <h2 id="developer-title">Desenvolvimento</h2>
        <p>{developer}</p>
        {contact && <p><a href={`mailto:${contact}`}>{contact}</a></p>}
      </section>
      <section className="card panel-form" aria-labelledby="version-title">
        <h2 id="version-title">Versão atual</h2>
        <p><strong>v{currentRelease.version}</strong>{release.deployedRevision && <> · revisão <code>{release.deployedRevision.slice(0, 7)}</code></>}</p>
        {pending ? <>
          <p role="status"><strong>Nova atualização</strong> · v{release.latest.version} · revisão <code>{release.head.sha.slice(0, 7)}</code></p>
          <p>A nova publicação fica disponível assim que a hospedagem conclui a implantação. Use Atualizar para recarregar o site e conferir.</p>
          <a className="primary" href="/sobre?verificar=1">Atualizar</a>
          <a className="secondary" href={`#versao-${release.latest.version}`}>O que mudou</a>
        </> : <>
          <p role="status">{release.available ? "Você está na versão mais recente." : "Não foi possível verificar atualizações agora."}</p>
          <a className="secondary" href="/sobre?verificar=1">Verificar atualizações</a>
        </>}
      </section>
    </div>

    <section className="panel-form" aria-labelledby="history-title">
      <h2 id="history-title">Histórico de atualizações</h2>
      {release.history.map((entry, index) => {
        const unreleased = compareVersions(entry.version, currentRelease.version) > 0;
        return <details className="card panel-form" id={`versao-${entry.version}`} key={entry.version} open={index === 0}>
          <summary>v{entry.version} · {entry.title}{unreleased ? " · Em publicação" : ""}</summary>
          <p><time dateTime={entry.date}>{entry.date.split("-").reverse().join("/")}</time></p>
          <ul>{entry.changes.map((change) => <li key={change}>{change}</li>)}</ul>
        </details>;
      })}
    </section>
  </section>;
}
