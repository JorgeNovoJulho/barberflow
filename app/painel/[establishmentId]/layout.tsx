import { NotificationSound } from "./notification-sound";
import { PurchaseUpdates } from "../../minhas-compras/purchase-updates";
import Link from "next/link";
import type { ReactNode } from "react";
import { httpsUrl } from "../../../lib/business-profile";
import { mediaLinks } from "../../cliente/social";
import { isUuid } from "../../../lib/establishments";
import { supabaseServer } from "../../../lib/supabase";
import { WorkspaceNav } from "./workspace-nav";

export default async function EstablishmentLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ establishmentId: string }>;
}) {
  const { establishmentId: shop } = await params;
  const supabase = isUuid(shop) ? await supabaseServer() : null;
  const business = await supabase?.from("barberflow_establishments").select("name,owner_id,profile_details").eq("id", shop).maybeSingle();
  if (!supabase || !business?.data) return children;
  const access = await supabase.rpc("barberflow_shop_access_state", { shop });
  if (access.data === "blocked") return <section className="container section">
    <h1>Estabelecimento bloqueado</h1>
    <p>Entre em contato com a administração do BARBERFLOW para regularizar o acesso.</p>
    <Link href="/painel">Voltar aos estabelecimentos</Link>
  </section>;
  const user = (await supabase.auth.getUser()).data.user;
  const [bookings, orders, notices] = await Promise.all([
    supabase.from("barberflow_schedule").select("id", { count: "exact", head: true })
      .eq("establishment_id", shop).or("booked_by.not.is.null,guest_online.eq.true").not("booking_created_at", "is", null).is("booking_read_at", null).is("booking_cleared_at", null),
    user?.id === business.data.owner_id
      ? supabase.from("barberflow_showcase_orders").select("id", { count: "exact", head: true })
        .eq("establishment_id", shop).in("status", ["pending", "paid", "ready"])
      : null,
    user?.id === business.data.owner_id ? supabase.rpc("barberflow_booking_notifications", { shop }) : null,
  ]);
  const notificationBatch = notices?.data?.items ? {
    asOf: notices.data.as_of as string,
    items: (notices.data.items as { id: string; kind: string; booking_created_at: string; booking_read_at: string | null }[])
      .filter((item) => !item.booking_read_at)
      .map((item) => ({ id: item.kind + ":" + item.id, created: item.booking_created_at })),
  } : null;
  const logo = httpsUrl(business.data.profile_details?.logo);
  let image = logo || undefined;
  if (!image && user) {
    const { data: profile } = await supabase.from("barberflow_social_profiles").select("avatar").eq("user_id", user.id).maybeSingle();
    if (profile?.avatar) image = (await mediaLinks(supabase, [profile.avatar])).get(profile.avatar);
  }
  return <div className="container workspace">
    <PurchaseUpdates interval={10_000} />
    <NotificationSound key={shop} batch={notificationBatch} />
    <WorkspaceNav shop={shop} name={business.data.name} image={image} unread={Number(notices?.data?.unread ?? bookings.count ?? 0)} pendingOrders={orders ? orders.count ?? 0 : undefined} />
    <div className="workspace-content">{children}</div>
  </div>;
}
