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
  const { data: session } = await supabase.auth.getClaims();
  const workspace = /^\/(painel|equipe)\/([a-f0-9-]{36})(?:\/([^/]+))?\/?/i.exec(request.nextUrl.pathname);
  if (session?.claims.sub && workspace && workspace[3] !== "assinatura") {
    const [, area, shop] = workspace;
    const { data: access } = await supabase.rpc("barberflow_shop_access_state", { shop });
    if (access === "expired" || access === "blocked" || access === "frozen") {
      const target = request.nextUrl.clone();
      target.pathname = area === "painel" ? `/painel/${shop}/assinatura` : "/painel";
      target.search = "";
      target.searchParams.set("estado", area === "painel" ? "acesso-" + access : "assinatura-equipe");
      const redirect = NextResponse.redirect(target, 303);
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      return redirect;
    }
  }
  return response;
}

export const config = {
  matcher: ["/login", "/cadastro", "/recuperar-senha", "/nova-senha", "/configuracoes/:path*", "/painel/:path*", "/gestao-master/:path*", "/equipe/:path*", "/convite-equipe/:path*", "/estabelecimento/:path*", "/meus-agendamentos", "/minhas-compras"],
};
