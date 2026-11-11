import Link from "next/link";
import QRCode from "qrcode";
import { showcasePix } from "../../../../../lib/pix";
import { bookingCurrency } from "../../../../../lib/public-booking";
import { cardAdmin, cardProviders, isCardCheckout, type CardProvider } from "../../../../../lib/card-payments";
import { CopyPix } from "../../assinatura/copy-pix";
import { SubmitButton } from "../../../../auth/submit";
import { cardCheckout, syncCardCheckout } from "../../financeiro/pagamentos/actions";
import { paymentFeedback } from "../../financeiro/pagamentos/feedback";

type Pix = { pix_key: string; merchant: string; city: string };
type CardState = {
  account: { sandbox: boolean } | null;
  charge: { id: string; url: string | null; expires: string; sandbox: boolean; status: string; amount: number; provider: CardProvider } | null;
};

export async function CollectPayment({ shop, receipt, balance, pix, cards, status }: {
  shop: string; receipt: string; balance: number; pix: Pix | null; cards: CardState | null; status?: string;
}) {
  const active = cards?.charge?.status === "open" ? cards.charge : null;
  const canUseCards = !!cardAdmin();
  const settings = `/painel/${shop}/financeiro/pagamentos`;
  const pixCode = pix && !active && balance > 0 ? showcasePix({ id: receipt, ...pix, total_cents: balance }) : null;
  const qr = pixCode ? await QRCode.toDataURL(pixCode, { scale: 6, margin: 4, errorCorrectionLevel: "M" }) : null;
  const liveLink = active?.url && Date.parse(active.expires) > Date.now() && isCardCheckout(active.url) ? active.url : null;
  return <div className="collection-options">
    {status && Object.hasOwn(paymentFeedback, status) && <p role="status">{paymentFeedback[status]}</p>}
    {active ? <section>
      <h3>Cobrança por cartão em aberto{active.sandbox ? " · teste" : ""}</h3>
      <p>Valor {bookingCurrency.format(active.amount / 100)}. Consulte o provedor antes de oferecer outra forma de pagamento.</p>
      {liveLink && <div className="account-links">
        <a className="primary" href={liveLink} target="_blank" rel="noopener noreferrer">Abrir checkout de {cardProviders[active.provider]}</a>
        <CopyPix value={liveLink} link />
      </div>}
      {!active.url && Date.parse(active.expires) > Date.now() && <form action={cardCheckout.bind(null, shop, receipt)}>
        <SubmitButton disabled={!canUseCards}>Preparar link de cartão</SubmitButton>
      </form>}
      <form action={syncCardCheckout.bind(null, shop, receipt)}>
        <SubmitButton disabled={!canUseCards}>Consultar pagamento no provedor</SubmitButton>
      </form>
    </section> : balance > 0 ? <>
      <section>
        <h3>Receber por Pix</h3>
        {qr && pixCode ? <>
          <p>Escaneie ou copie o código para pagar o saldo de <strong>{bookingCurrency.format(balance / 100)}</strong>.</p>
          <img className="payment-qr" src={qr} alt="Código QR Pix para o saldo da comanda" width={300} height={300} />
          <label className="showcase-pix-code">Pix Copia e Cola
            <textarea readOnly value={pixCode} rows={3} spellCheck={false} />
          </label>
          <CopyPix value={pixCode} code />
          <p>Confira o crédito no extrato antes de <Link href={`/painel/${shop}/financeiro#comandas`}>registrar o recebimento</Link>.</p>
        </> : <p><Link href={settings}>Cadastre a conta Pix do estabelecimento</Link> para gerar o código.</p>}
      </section>
      <section>
        <h3>Receber por cartão</h3>
        {cards?.account && canUseCards ? <form action={cardCheckout.bind(null, shop, receipt)}>
          {cards.account.sandbox && <p>Ambiente de teste. O pagamento de teste não baixa o saldo da comanda.</p>}
          <p>Use cartão se ainda não enviou um código Pix para este saldo.</p>
          <SubmitButton>Gerar link de pagamento por cartão</SubmitButton>
        </form> : <p><Link href={settings}>Configurar provedor de cartão</Link></p>}
      </section>
    </> : <p>Comanda quitada.</p>}
  </div>;
}
