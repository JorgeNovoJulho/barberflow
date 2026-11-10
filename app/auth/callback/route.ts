import { NextRequest, NextResponse } from "next/server";
import { localPath, authOrigin } from "../../../lib/auth-path";
import { cookies } from "next/headers";
import { accountKind, afterLogin } from "../../../lib/account-role";
import { supabaseServer } from "../../../lib/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await supabaseServer();
  const jar = await cookies();
  const chosen = accountKind(jar.get("bf_google_signup")?.value);
  const googleError = () => NextResponse.redirect(new URL("/cadastro?"+new URLSearchParams({tipo:chosen ?? "",estado:"google"}),authOrigin()));
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  if (supabase && tokenHash && request.nextUrl.searchParams.get("type") === "recovery") {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    if (!error) return NextResponse.redirect(new URL("/nova-senha", authOrigin()));
  }
  if (code && supabase) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const next = localPath(request.nextUrl.searchParams.get("next"));
      if (next === "/nova-senha") return NextResponse.redirect(new URL(next, authOrigin()));
      if (chosen) {
        jar.delete("bf_google_signup");
        const initialized = await supabase.rpc("barberflow_initialize_google_account", { chosen_kind: chosen });
        if (initialized.error) {
          await supabase.auth.signOut({ scope: "local" });
          return googleError();
        }
      }
      const destination = await afterLogin(supabase, data.user, next);
      return NextResponse.redirect(new URL(destination, authOrigin()));
    }
  }

  if (chosen) {
    jar.delete("bf_google_signup");
    return googleError();
  }
  return NextResponse.redirect(new URL("/login?erro=link", authOrigin()));
}
