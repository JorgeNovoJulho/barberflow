"use server";
import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { requireMaster } from "../../../lib/master";

export async function createInvite() {
  const client = await requireMaster("/gestao-master/divulgadores");
  const token = randomBytes(32).toString("hex");
  const { data } = await client.rpc("barberflow_create_promoter_invite", {
    digest_hex: createHash("sha256").update(token).digest("hex"),
  });
  redirect(data ? "/gestao-master/divulgadores?convite=" + token : "/gestao-master/divulgadores?erro=1");
}

export async function saveCommission(form: FormData) {
  const client = await requireMaster("/gestao-master/divulgadores");
  const raw = String(form.get("cents") ?? "");
  const { data } = /^\d{1,8}$/.test(raw)
    ? await client.rpc("barberflow_promoter_commission_settings", { cents: Number(raw) }) : { data: false };
  redirect("/gestao-master/divulgadores?" + (data ? "salvo=1" : "erro=1"));
}

export async function managePromoter(member: string, form: FormData) {
  const client = await requireMaster("/gestao-master/divulgadores");
  const operation = String(form.get("operation") ?? "");
  const date = String(form.get("until") ?? "");
  const { data } = await client.rpc("barberflow_manage_promoter", {
    member, operation, until_date: date || null,
  });
  redirect("/gestao-master/divulgadores?" + (data ? "salvo=1" : "erro=1"));
}
