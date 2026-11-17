import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { ServiceCatalog, type Assignments } from "../../../painel/[establishmentId]/servicos/service-catalog";

export default async function TeamServices({ params, searchParams }: {
  params: Promise<{ shop: string }>; searchParams: Promise<{ estado?: string; vincular?: string }>;
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
  const [{ data, error }, assignments] = await Promise.all([supabase.from("barberflow_services")
    .select("id,name,description,category,price_cents,duration_minutes,active,display_order,photo_path,video_path,extra_photos,video_url").is("deleted_at", null)
    .eq("establishment_id", shop).order("active", { ascending: false }).order("display_order").order("name").order("id"),
    supabase.rpc("barberflow_team_service_assignments", { shop }),
  ]);
  const { estado, vincular } = await searchParams;
  const links = assignments.data as Pick<Assignments, "professionals" | "links"> | null;
  return <ServiceCatalog establishmentId={shop} name={business.name} services={data ?? []} failed={Boolean(error)} estado={estado} assignments={{
    professionals: links?.professionals ?? [], links: links?.links ?? [], failed: !links || !!assignments.error, open: vincular,
  }} team />;
}
