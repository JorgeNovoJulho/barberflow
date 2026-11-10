"use server";

import { redirect } from "next/navigation";
import { requireMaster } from "../../../lib/master";
import { authOrigin } from "../../../lib/auth-path";
import { isUuid } from "../../../lib/establishments";

const path = "/gestao-master/usuarios";

export async function requestUserRecovery(userId: string) {
  const supabase = await requireMaster(path);
  if (process.env.BARBERFLOW_MASTER_RECOVERY_EMAILS !== "true") redirect(path + "?estado=smtp");
  if (!isUuid(userId)) redirect(path + "?estado=falha");
  const { data: email, error } = await supabase.rpc("barberflow_master_recovery_email", { target_user: userId });
  if (error || typeof email !== "string") redirect(path + "?estado=falha");
  const callback = new URL("/auth/callback", authOrigin());
  callback.searchParams.set("next", "/nova-senha");
  const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback.href });
  redirect(path + (recoveryError ? "?estado=falha" : "?estado=enviado"));
}
