import { NotificationSound } from "./notification-sound";
import { PurchaseUpdates } from "../../minhas-compras/purchase-updates";
import Link from "next/link";
import { subscriptionPlanLabel, tierLabel, type SubscriptionStatus } from "../../../lib/subscriptions";
import { SubscriptionApprovalNotice } from "./subscription-approval-notice";
import { offsetDay, saoPauloToday } from "../../../lib/agenda";
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
  const { data: planData } = await supabase.rpc("barberflow_subscription_status", { shop });
  const plan = planData as SubscriptionStatus | null;
  const today = saoPauloToday();
  const expiry = plan?.ends_before ? offsetDay(plan.ends_before, -1).split("-").reverse().join("/") : null;
  const user = (await supabase.auth.getUser()).data.user;
  const [bookings, orders, notices, payment] = await Promise.all([
    supabase.from("barberflow_schedule").select("id", { count: "exact", head: true })
      .eq("establishment_id", shop).or("booked_by.not.is.null,guest_online.eq.true").not("booking_created_at", "is", null).is("booking_read_at", null).is("booking_cleared_at", null),
    user?.id === business.data.owner_id
      ? supabase.from("barberflow_showcase_orders").select("id", { count: "exact", head: true })
        .eq("establishment_id", shop).in("status", ["pending", "paid", "ready"])
      : null,
    user?.id === business.data.owner_id ? supabase.rpc("barberflow_booking_notifications", { shop }) : null,
    user?.id === business.data.owner_id ? supabase.from("barberflow_subscription_payments")
      .select("id,plan,starts_on,ends_before").eq("establishment_id", shop)
      .gt("ends_before", today)
      .order("confirmed_at", { ascending: false }).limit(1).maybeSingle() : null,
  ]);
  const notificationBatch = Array.isArray(notices?.data?.items) ? {
    asOf: notices.data.as_of as string,
    items: (notices.data.items as { id: string; kind: string; booking_created_at: string; booking_read_at: string | null }[])
      .filter((item) => !item.booking_read_at)
      .map((item) => ({ id: item.kind + ":" + item.id, created: item.booking_created_at })),
  } : null;
  const logo = httpsUrl(business.data.profile_details?.logo);
  let image = logo || undefined;
  if (!image && user) {
    const { data: profile } = await supabase.from("barberflow_social_profiles").select("avatar").eq("user_id", user.id).maybeSingle();
    if (profile?.avatar) {
      image = await mediaLinks(supabase, [profile.avatar]).then((links) => links.get(profile.avatar)).catch(() => undefined);
    }
  }
  return <div className="container workspace">
    <PurchaseUpdates interval={10_000} />
    <NotificationSound key={shop} batch={notificationBatch} />
    <WorkspaceNav shop={shop} name={business.data.name} image={image} unread={Number(notices?.data?.unread ?? bookings.count ?? 0)} pendingOrders={orders ? orders.count ?? 0 : undefined} plan={plan?.plan} expiry={expiry} />
    <div className="workspace-content">
      {payment?.data && <SubscriptionApprovalNotice key={payment.data.id} id={payment.data.id}>
        <strong>Assinatura aprovada</strong>{" · "}{tierLabel(payment.data.plan)}.
        {payment.data.starts_on > today
          ? ` As funções serão liberadas em ${payment.data.starts_on.split("-").reverse().join("/")}.`
          : plan?.state === "normal" ? " As funções do plano estão liberadas." : " Consulte a situação de acesso na assinatura."}
        {" "}<Link href={`/painel/${shop}/assinatura#historico-pagamentos`}>Ver assinatura</Link>
      </SubscriptionApprovalNotice>}

      {plan?.state === "normal" && plan.days_left !== null && plan.days_left <= 7 &&
        <p role="status" data-feedback="warning" className="workspace-renewal">
          {plan.days_left <= 0 ? "O período contratado venceu. Renove durante o prazo de regularização."
            : `O plano ${subscriptionPlanLabel(plan.plan)} vence ${plan.days_left === 1 ? "hoje" : `em ${plan.days_left} dias`}.`}
          {" "}<Link href={`/painel/${shop}/assinatura`}>Ver assinatura</Link>
        </p>}
      {children}
    </div>
  </div>;
}
