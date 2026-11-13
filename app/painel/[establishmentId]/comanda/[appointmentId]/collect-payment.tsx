import { redirect } from "next/navigation";
import { supabaseServer } from "../../../../../lib/supabase";
import { CashReceived } from "../../../../equipe/[shop]/comanda/[appointment]/cash-received";
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

async function confirm(shop: string, receipt: string, balance: number, method: string, form: FormData) {
  "use server";
  const client = await supabaseServer();
  const raw = String(form.get("cash") ?? "").trim().replace(",", ".");
  const tendered = /^\d{1,8}(\.\d{1,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : null;
  const { data } = await client?.rpc("barberflow_collect_order", { shop, appointment: receipt, payment_method: method, expected: balance, tendered }) ?? {};
  redirect(`/painel/${shop}/comanda/${receipt}?pagamento=${data ? "recebido" : "falha"}#recebimento`);
}

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
    {status === "recebido" && <p role="status">Recebimento confirmado.</p>}
    {status === "falha" && <p role="alert">Não foi possível confirmar. Confira o saldo atual e tente novamente.</p>}
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
      <details name="order-payment-method"><summary className="secondary">Pix</summary>
        {qr && pixCode ? <>
          <p>Valor a receber: {bookingCurrency.format(balance / 100)}</p>
          <img className="payment-qr" src={qr} alt="QR Code Pix da comanda" width={300} height={300} />
          <CopyPix value={pixCode} code />
          <form action={confirm.bind(null, shop, receipt, balance, "pix")}><SubmitButton tone="keep">Confirmar recebimento</SubmitButton></form>
        </> : <p><Link href={settings}>Configurar Pix do estabelecimento</Link></p>}
      </details>
      {(["debit", "credit"] as const).map((method) => <details name="order-payment-method" key={method}>
        <summary className="secondary">{method === "debit" ? "Débito" : "Crédito"}</summary>
        <p>Valor para digitar na maquininha: <strong>{bookingCurrency.format(balance / 100)}</strong></p>
        <form action={confirm.bind(null, shop, receipt, balance, method)}><SubmitButton tone="keep">Confirmar pagamento</SubmitButton></form>
        {cards?.account && canUseCards && <form action={cardCheckout.bind(null, shop, receipt)}><SubmitButton>Gerar link de cartão</SubmitButton></form>}
      </details>)}
      <details name="order-payment-method"><summary className="secondary">Dinheiro</summary>
        <p>Total a receber: <strong>{bookingCurrency.format(balance / 100)}</strong></p>
        <form className="account-form" action={confirm.bind(null, shop, receipt, balance, "cash")}><CashReceived total={balance} /></form>
      </details>
    </> : <p>Comanda quitada.</p>}
  </div>;
}
