import Link from "next/link";
import type { ReactNode } from "react";
import { isUuid } from "../../../lib/establishments";
import { supabaseServer } from "../../../lib/supabase";

export default async function EstablishmentLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ establishmentId: string }>;
}) {
  const { establishmentId: shop } = await params;
  const supabase = isUuid(shop) ? await supabaseServer() : null;
  const business = await supabase?.from("barberflow_establishments").select("id").eq("id", shop).maybeSingle();
  if (!supabase || !business?.data) return children;
  const { count } = await supabase.from("barberflow_schedule").select("id", { count: "exact", head: true })
    .eq("establishment_id", shop).not("booked_by", "is", null).not("booking_created_at", "is", null).is("booking_read_at", null);
  return <>
    <nav className="container account-links" aria-label="Avisos do estabelecimento">
      <Link className="secondary" href={`/painel/${shop}/resumo?notificacoes=1#notificacoes`}>
        Notificações{count ? ` · ${count} não lida(s)` : ""}
      </Link>
    </nav>
    {children}
  </>;
}
