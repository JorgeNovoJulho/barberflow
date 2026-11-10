import { NextRequest, NextResponse } from "next/server";
import { localPath, authOrigin } from "../../../lib/auth-path";
import { isMasterAccount, masterPath } from "../../../lib/master";
import { supabaseServer } from "../../../lib/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await supabaseServer();
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  if (supabase && tokenHash && request.nextUrl.searchParams.get("type") === "recovery") {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    if (!error) return NextResponse.redirect(new URL("/nova-senha", authOrigin()));
  }
  if (code && supabase) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const next = localPath(request.nextUrl.searchParams.get("next"));
      const destination = next === "/nova-senha" ? next : await isMasterAccount(supabase, data.user?.email) ? masterPath : next;
      return NextResponse.redirect(new URL(destination, authOrigin()));
    }
  }

  return NextResponse.redirect(new URL("/login?erro=link", authOrigin()));
}
