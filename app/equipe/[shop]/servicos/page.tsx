import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { ServiceCatalog } from "../../../painel/[establishmentId]/servicos/service-catalog";

export default async function TeamServices({ params, searchParams }: {
  params: Promise<{ shop: string }>; searchParams: Promise<{ estado?: string }>;
}) {
  const { shop } = await params;
  if (!isUuid(shop)) notFound();
  const path = `/equipe/${shop}/servicos`;
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: path }));
  const [access, memberships] = await Promise.all([
    supabase.rpc("barberflow_team_can_edit_services", { shop }),
    supabase.rpc("barberflow_my_team_shops"),
  ]);
  const business = (memberships.data as { id: string; name: string }[] | null)?.find(({ id }) => id === shop);
  if (access.data !== true || !business) notFound();
  const { data, error } = await supabase.from("barberflow_services")
    .select("id,name,description,category,price_cents,duration_minutes,active,display_order,photo_path,video_path").is("deleted_at", null)
    .eq("establishment_id", shop).order("active", { ascending: false }).order("display_order").order("name").order("id");
  const { estado } = await searchParams;
  return <ServiceCatalog establishmentId={shop} name={business.name} services={data ?? []} failed={Boolean(error)} estado={estado} team />;
}
