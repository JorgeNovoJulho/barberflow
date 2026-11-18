"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { checkPlanLimit, createUpgradeCharge, loadUpgradeCharge, upgradeContext, uploadUpgradeProof } from "./plan-upgrade-actions";
import { planNames, planPrice, planTiers, tiers, type PlanPeriod } from "../lib/subscriptions";
import { bookingCurrency } from "../lib/currency";
import { CopyPix } from "./painel/[establishmentId]/assinatura/copy-pix";

type Context = NonNullable<Awaited<ReturnType<typeof upgradeContext>>>;
type Charge = NonNullable<Awaited<ReturnType<typeof loadUpgradeCharge>>["charge"]>;
const rank: Record<string, number> = { pro: 1, premium: 2, unlimited: 3 };

export function PlanUpgrade() {
  const pathname = usePathname();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const lastReason = useRef("");
  const [context, setContext] = useState<Context | null>(null);
  const [reason, setReason] = useState("");
  const [period, setPeriod] = useState<PlanPeriod>("monthly");
  const [charge, setCharge] = useState<Charge | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const match = pathname.match(/^\/(?:painel|equipe)\/([a-f0-9-]{36})(?:\/|$)/);
  const shop = match?.[1] ?? "";

  useEffect(() => {
    if (!shop) return;
    const approved = new WeakSet<HTMLFormElement>();
    const checking = new WeakSet<HTMLFormElement>();
    let alive = true;
    async function open(message: string) {
      if (dialog.current?.open || lastReason.current === message) return;
      lastReason.current = message;
      const result = await upgradeContext(shop);
      if (!alive || !result) return;
      setContext(result);
      setReason(message);
      setCharge(null);
      setError("");
      setPeriod("monthly");
      dialog.current?.showModal();
    }
    const submit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.dataset.planResource) return;
      if (approved.has(form)) { approved.delete(form); return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (checking.has(form)) return;
      checking.add(form);
      const data = new FormData(form);
      if (form.dataset.planPerson) data.set("quota_person",form.dataset.planPerson);
      if (form.dataset.planService) data.set("quota_service",form.dataset.planService);
      if (form.dataset.planDay) data.set("day",form.dataset.planDay);
      if (form.dataset.planShowcase === "true") data.set("showcase","on");
      const submitter = (event as SubmitEvent).submitter;
      void checkPlanLimit(shop,form.dataset.planResource,data).then(message => {
        if (!alive) return;
        if (message) { lastReason.current = ""; void open(message); return; }
        approved.add(form);
        form.requestSubmit(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
      }).catch(() => {
        if (!alive) return;
        approved.add(form);
        form.requestSubmit(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
      }).finally(() => checking.delete(form));
    };
    const read = () => {
      const notices = document.querySelectorAll("main p[role=alert], main p[role=status]");
      for (const notice of notices) {
        const text = notice.textContent?.trim() ?? "";
        if (notice.getClientRects().length && /limite.*plano|plano.*permite.*(?:profissionais|serviços|agendamentos|produtos)/i.test(text)) {
          void open(text);
          return;
        }
      }
    };
    const observer = new MutationObserver(read);
    observer.observe(document.querySelector("main") ?? document.body,{ childList:true,subtree:true,characterData:true });
    document.addEventListener("submit",submit,true);
    read();
    return () => { alive=false; observer.disconnect(); document.removeEventListener("submit",submit,true); };
  }, [shop, pathname]);

  useEffect(() => {
    if (!shop || !charge || charge.status !== "submitted") return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== "visible" || !dialog.current?.open) return;
      try {
        const result = await loadUpgradeCharge(shop,charge.id);
        if (alive && result.charge) {
          setCharge(result.charge);
          if (result.charge.status === "confirmed") router.refresh();
        }
      } catch { /* The next visible poll retries. */ }
    };
    const timer = window.setInterval(() => { void check(); }, 10000);
    document.addEventListener("visibilitychange",check);
    return () => { alive=false; clearInterval(timer); document.removeEventListener("visibilitychange",check); };
  }, [shop,charge?.id,charge?.status,router]);

  useEffect(() => {
    if (charge?.status !== "confirmed") return;
    const timer = window.setTimeout(() => { dialog.current?.close(); setContext(null); },2500);
    return () => clearTimeout(timer);
  }, [charge?.status]);

  async function selectPlan(plan: string) {
    if (pending) return;
    setPending(true); setError("");
    try {
      const result = await createUpgradeCharge(shop,plan,period);
      if ("charge" in result && result.charge) setCharge(result.charge);
      else setError(result.error ?? "Não foi possível gerar o Pix.");
    } catch { setError("A conexão foi interrompida. Tente novamente."); }
    finally { setPending(false); }
  }

  async function proof(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!charge || pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const result = await uploadUpgradeProof(shop,charge.id,data);
      if ("charge" in result && result.charge) setCharge(result.charge);
      else setError(result.error ?? "Não foi possível enviar o comprovante.");
    } catch { setError("Não foi possível confirmar o envio. Consulte sua assinatura antes de reenviar."); }
    finally { setPending(false); }
  }

  const available = context ? tiers.filter(tier => rank[tier] > (rank[context.status.plan] ?? 0)
    && (!context.status.promoter || tier === "premium")) : [];

  return <dialog ref={dialog} className="plan-upgrade-dialog" aria-labelledby="upgrade-title"
    onClose={() => setContext(null)}>
    <div className="upgrade-dialog-heading">
      <h2 id="upgrade-title">Amplie o plano da sua loja</h2>
      <button type="button" className="secondary" aria-label="Fechar opções de upgrade" onClick={() => dialog.current?.close()}>×</button>
    </div>
    {context && <>
      <p>{reason}</p>
      {!context.status.owner ? <p>Entre em contato com o proprietário da loja para alterar a assinatura.</p>
      : !charge ? <>
        {!context.status.promoter && <div className="account-links" role="group" aria-label="Período do upgrade">
          {(["monthly","yearly"] as const).map(value => <button type="button" key={value} className="secondary"
            aria-pressed={period===value} onClick={() => setPeriod(value)}>{planNames[value]}</button>)}
        </div>}
        <div className="upgrade-plan-options">{available.map(tier => <article className="card subscription-plan" data-tier={tier} key={tier}>
          <h3>{planTiers[tier].name}</h3><p className="plan-catalog-price">{planPrice(context.prices,tier,period)}</p>
          <ul>{planTiers[tier].limits.map(limit => <li key={limit}>{limit}</li>)}</ul>
          <button type="button" className="primary" disabled={pending} onClick={() => selectPlan(tier)}>Gerar Pix · {planTiers[tier].name}</button>
        </article>)}</div>
        <p>Após a confirmação do recebimento pelo administrador, os limites do upgrade ficam disponíveis imediatamente.</p>
        {!available.length && <p>Consulte o suporte para revisar os limites e as condições desta conta.</p>}
      </> : <>
        <h3>{planTiers[charge.plan as keyof typeof planTiers]?.name ?? charge.plan} · {planNames[charge.period as PlanPeriod]}</h3>
        <p className="plan-catalog-price">{bookingCurrency.format(charge.amount/100)}</p>
        {charge.status === "confirmed" ? <p role="status">Upgrade concluído! Novos limites liberados.</p>
        : charge.status === "rejected" ? <p role="alert">{charge.reason || "O comprovante precisa de revisão."}</p>
        : charge.status === "submitted" ? <p role="status">Comprovante enviado. Aguardando conferência do pagamento pelo administrador.</p>
        : <>
          {charge.qr && <img className="upgrade-pix-qr" src={charge.qr} alt="QR Code Pix da assinatura selecionada" width={256} height={256} />}
          {charge.code && <><label>Código Pix Copia e Cola<textarea readOnly rows={4} value={charge.code} /></label><CopyPix value={charge.code} code /></>}
          <p>Pague o valor indicado e envie o comprovante para conferência.</p>
          <form className="account-form" onSubmit={proof}>
            <label>Comprovante do pagamento <input type="file" name="proof" accept=".pdf,.jpg,.jpeg,.png,.bmp,.webp" required /></label>
            <small>PDF ou imagem de até 5 MB.</small>
            <button className="primary" disabled={pending}>{pending ? "Enviando…" : "Enviar comprovante"}</button>
          </form>
        </>}
        <Link className="secondary" href={`/painel/${shop}/assinatura?cobranca=${charge.id}#pix-${charge.id}`} onClick={() => dialog.current?.close()}>Ver cobrança na assinatura</Link>
      </>}
      {error && <p role="alert">{error}</p>}
    </>}
  </dialog>;
}
