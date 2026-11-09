import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { ServiceCatalog } from "./service-catalog";

export default async function Services({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { establishmentId } = await params;
  if (!isUuid(establishmentId)) notFound();
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: `/painel/${establishmentId}/servicos` }));

  const { data: establishment, error: establishmentError } = await supabase.from("barberflow_establishments")
    .select("name").eq("id", establishmentId).maybeSingle();
  if (establishmentError) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!establishment) notFound();

  const { data: services, error } = await supabase.from("barberflow_services")
    .select("id,name,description,category,price_cents,duration_minutes,active,display_order,photo_path,video_path").is("deleted_at", null)
    .eq("establishment_id", establishmentId).order("active", { ascending: false }).order("display_order").order("name").order("id");
  const { estado } = await searchParams;

  return <ServiceCatalog establishmentId={establishmentId} name={establishment.name} services={services ?? []} failed={Boolean(error)} estado={estado} />;
}
