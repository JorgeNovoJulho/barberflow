import { NextRequest, NextResponse } from "next/server";
import { localPath, authOrigin } from "../../../lib/auth-path";
import { supabaseServer } from "../../../lib/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await supabaseServer();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(localPath(request.nextUrl.searchParams.get("next")), authOrigin()));
  }

  return NextResponse.redirect(new URL("/login?erro=link", authOrigin()));
}
