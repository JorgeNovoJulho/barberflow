import type { ReactNode } from "react";
import { isUuid } from "../../../lib/establishments";
import { supabaseServer } from "../../../lib/supabase";
import { WorkspaceNav } from "./workspace-nav";

export default async function EstablishmentLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ establishmentId: string }>;
}) {
  const { establishmentId: shop } = await params;
  const supabase = isUuid(shop) ? await supabaseServer() : null;
  const business = await supabase?.from("barberflow_establishments").select("name,owner_id").eq("id", shop).maybeSingle();
  if (!supabase || !business?.data) return children;
  const user = (await supabase.auth.getUser()).data.user;
  const [bookings, orders] = await Promise.all([
    supabase.from("barberflow_schedule").select("id", { count: "exact", head: true })
      .eq("establishment_id", shop).not("booked_by", "is", null).not("booking_created_at", "is", null).is("booking_read_at", null),
    user?.id === business.data.owner_id
      ? supabase.from("barberflow_showcase_orders").select("id", { count: "exact", head: true })
        .eq("establishment_id", shop).eq("status", "paid").is("read_at", null)
      : null,
  ]);
  return <div className="container workspace">
    <WorkspaceNav shop={shop} name={business.data.name} unread={bookings.count ?? 0} paidOrders={orders ? orders.count ?? 0 : undefined} />
    <div className="workspace-content">{children}</div>
  </div>;
}
