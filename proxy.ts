import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(updates) {
        for (const { name, value } of updates) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of updates) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/login", "/cadastro", "/recuperar-senha", "/nova-senha", "/configuracoes/:path*", "/painel/:path*", "/gestao-master/:path*", "/equipe/:path*", "/convite-equipe/:path*", "/estabelecimento/:path*", "/meus-agendamentos", "/minhas-compras"],
};
