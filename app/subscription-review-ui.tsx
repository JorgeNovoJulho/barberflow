import { httpsUrl } from "../lib/business-profile";

export function SubscriptionBusiness({ name, logo }: { name: string; logo?: string | null }) {
  const src = httpsUrl(logo ?? undefined);
  return <span className="subscription-business">
    {src ? <img src={src} width={44} height={44} alt="" loading="lazy" />
      : <span aria-hidden="true">{name.trim().slice(0, 2).toUpperCase()}</span>}
    <strong>{name}</strong>
  </span>;
}

export function SubscriptionProofPreview({ src, pdf }: { src: string; pdf: boolean }) {
  if (pdf) return <object className="subscription-proof-preview" data={src} type="application/pdf"
    aria-label="Prévia do comprovante em PDF">
    <a href={src} target="_blank" rel="noopener noreferrer">Abrir prévia do PDF</a>
  </object>;
  return <img className="subscription-proof-preview" src={src} alt="Miniatura do comprovante" loading="lazy" />;
}
