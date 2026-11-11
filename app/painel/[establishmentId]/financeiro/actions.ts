"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid, parsePrice } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { validDay } from "../../../../lib/agenda";
import { financeGuide, isExpenseGuide, type FinanceGuide } from "./guias";
import { authOrigin } from "../../../../lib/auth-path";

async function context(shop: string) {
  if (!isUuid(shop)) redirect("/painel");
  const path = `/painel/${shop}/financeiro`;
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: path }));
  return { supabase, user, path, finish(status: string, guide?: FinanceGuide): never {
    revalidatePath(path);
    const query = new URLSearchParams({ estado: status });
    if (guide) query.set("guia", financeGuide(guide));
    redirect(path + "?" + query);
  } };
}

export async function requestFinanceEmail(shop: string, form: FormData) {
  const { supabase, user, path } = await context(shop);
  const sale = String(form.get("comanda") ?? "");
  const finish = (status: string) => redirect(financeRecoveryPath(path, status, sale));
  if (!user.email || !user.email_confirmed_at) return finish("recuperacao-email-denied");
  const request = await supabase.rpc("barberflow_request_finance_email", { shop });
  if (request.error) return finish("recuperacao-email-falha");
  if (request.data !== "requested") return finish("recuperacao-email-" + request.data);
  const callback = new URL("/auth/callback", authOrigin());
  callback.searchParams.set("next", financeRecoveryPath(path, "email-verificado", sale));
  const { error } = await supabase.auth.signInWithOtp({
    email: user.email, options: { shouldCreateUser: false, emailRedirectTo: callback.href },
  });
  return finish(error?.status === 429 ? "recuperacao-email-limit" : error ? "recuperacao-email-falha" : "recuperacao-email-enviado");
}

function financeRecoveryPath(path: string, status: string, sale: string) {
  const query = new URLSearchParams({ estado: status });
  if (isUuid(sale)) query.set("comanda", sale);
  return path + "?" + query;
}

export type FinanceResetResult = string | { next: string } | null;

export async function resetFinanceWithEmail(shop: string, _previous: FinanceResetResult, form: FormData): Promise<FinanceResetResult> {
  const { supabase, path } = await context(shop);
  const sale = String(form.get("comanda") ?? "");
  const secret = String(form.get("new_secret") ?? "");
  if (secret.length < 8) return "Use pelo menos 8 caracteres na nova senha financeira.";
  if (Buffer.byteLength(secret) > 72) return "A nova senha ficou longa demais. Use menos caracteres.";
  if (secret !== form.get("confirmation")) return "A confirmação deve ser igual à nova senha financeira.";

  const { data, error } = await supabase.rpc("barberflow_reset_finance_email", { shop, new_secret: secret });
  if (!error) {
    switch (data) {
      case "reset":
        return { next: financeRecoveryPath(path, "senha-email-alterada", sale) };
      case "expired":
        redirect(financeRecoveryPath(path, "recuperacao-email-expired", sale));
      case "reused":
        return "A nova senha financeira precisa ser diferente da senha de login do TOP BARBER.";
      case "mfa":
        return "Conclua a verificação em duas etapas da conta antes de alterar a senha financeira.";
      case "denied":
        return "Somente o proprietário, com a conta confirmada, pode recuperar esta senha.";
      case "invalid":
        return "Escolha uma senha válida com pelo menos 8 caracteres.";
    }
  }
  return "Não foi possível salvar a senha financeira. Tente novamente.";
}

export async function unlockFinance(shop: string, setup: boolean, form: FormData) {
  const { supabase, finish, path } = await context(shop);
  const sale = String(form.get("comanda") ?? "");
  const appointment = String(form.get("atendimento") ?? "");
  const returnToPayments = isUuid(sale);
  const respond = (status: string) => {
    if (returnToPayments) {
      if (status === "desbloqueado") redirect(path + "/pagamentos?comanda=" + sale + "#conta-pix");
      redirect(path + "?" + new URLSearchParams({estado:status,comanda:sale}));
    }
    if (isUuid(appointment)) {
      if (status === "desbloqueado") redirect(`/painel/${shop}/comanda/${appointment}#recebimento`);
      redirect(path + "?" + new URLSearchParams({ estado: status, atendimento: appointment }));
    }
    return finish(status);
  };
  const secret = String(form.get("secret") ?? "");
  if (setup && (secret.length < 8 || Buffer.byteLength(secret) > 72 || form.get("confirmation") !== secret)) return respond("senha-invalida");
  const { data, error } = await supabase.rpc("barberflow_finance_unlock", { shop, secret, setup });
  return respond(error ? "falha" : data === "unlocked" ? "desbloqueado" : data === "blocked" ? "bloqueado" : data === "incorrect_blocked" ? "senha-bloqueada" : data === "incorrect_2" ? "senha-errada-2" : data === "incorrect_1" ? "senha-errada-1" : "senha-invalida");
}

export async function lockFinance(shop: string) {
  const { supabase, finish } = await context(shop);
  const { error } = await supabase.rpc("barberflow_finance_lock", { shop });
  return finish(error ? "falha" : "fechado");
}

export async function resetFinancePassword(shop: string, form: FormData) {
  const { supabase, finish } = await context(shop);
  const account = String(form.get("account_secret") ?? "");
  const secret = String(form.get("new_secret") ?? "");
  if (!account || Buffer.byteLength(account) > 72 || secret.length < 8
    || Buffer.byteLength(secret) > 72 || secret !== form.get("confirmation")) return finish("recuperacao-dados");
  const { data, error } = await supabase.rpc("barberflow_reset_finance_password", {
    shop, account_secret: account, new_secret: secret,
  });
  if (error || typeof data !== "string") return finish("recuperacao-falha");
  return finish(data === "reset" ? "senha-alterada" : "recuperacao-" + data);
}

export async function recordPayment(shop: string, receipt: string, requestId: string, form: FormData) {
  const { supabase, finish } = await context(shop);
  const cents = parsePrice(String(form.get("amount") ?? ""));
  const payment_method = String(form.get("method") ?? "");
  if (!isUuid(receipt) || !isUuid(requestId) || !cents || !["pix","cash","card","transfer","other"].includes(payment_method)) return finish("dados");
  const { data, error } = await supabase.rpc("barberflow_record_payment", { shop, receipt, request_id: requestId, cents, payment_method });
  return finish(error ? "falha" : data ? "recebido" : "saldo");
}

export async function reversePayment(shop: string, payment: string, form: FormData) {
  const { supabase, finish } = await context(shop);
  const reason = String(form.get("reason") ?? "").trim();
  if (!isUuid(payment) || !reason || reason.length > 240) return finish("dados");
  const { data, error } = await supabase.rpc("barberflow_reverse_payment", { shop, payment, reason });
  return finish(error || !data ? "falha" : "estornado");
}

export async function addFinanceEntry(shop: string, requestId: string, guide: FinanceGuide, form: FormData) {
  const { supabase, finish } = await context(shop);
  const direction = guide === "receivables" ? "in" : "out";
  const description = String(form.get("description") ?? "").trim();
  const category = String(form.get("category") ?? "").trim();
  const due = String(form.get("due") ?? "");
  const cents = parsePrice(String(form.get("amount") ?? ""));
  if (!isUuid(requestId) || (guide !== "receivables" && !isExpenseGuide(guide)) || !description || description.length > 160
    || !category || category.length > 80 || !validDay(due) || !cents) return finish("dados", guide);
  const { data, error } = await supabase.rpc("barberflow_add_finance_entry", {
    shop, request_id: requestId, entry_direction: direction, entry_description: description,
    entry_category: category, due_date: due, cents, expense_class: isExpenseGuide(guide) ? guide : null,
  });
  return finish(error || !data ? "falha" : "lancado", guide);
}

export async function classifyExpense(shop: string, entry: string, guide: FinanceGuide, form: FormData) {
  const { supabase, finish } = await context(shop);
  const expense_class = form.get("expense_type");
  if (!isUuid(entry) || !isExpenseGuide(expense_class)) return finish("dados", guide);
  const { data, error } = await supabase.rpc("barberflow_classify_expense", { shop, entry, expense_class });
  return error || !data ? finish("falha", guide) : finish("classificado", expense_class);
}

export async function settleFinanceEntry(shop: string, entry: string, requestId: string, guide: FinanceGuide, form: FormData) {
  const { supabase, finish } = await context(shop);
  const cents = parsePrice(String(form.get("amount") ?? ""));
  if (!isUuid(entry) || !isUuid(requestId) || !cents) return finish("dados", guide);
  const { data, error } = await supabase.rpc("barberflow_settle_finance_entry", { shop, entry, request_id: requestId, cents });
  return finish(error ? "falha" : data ? "baixado" : "saldo", guide);
}

export async function reverseFinanceEntry(shop: string, settlement: string, guide: FinanceGuide, form: FormData) {
  const { supabase, finish } = await context(shop);
  const reason = String(form.get("reason") ?? "").trim();
  if (!isUuid(settlement) || !reason || reason.length > 240) return finish("dados", guide);
  const { data, error } = await supabase.rpc("barberflow_reverse_finance_entry", { shop, settlement, reason });
  return finish(error || !data ? "falha" : "estornado", guide);
}
