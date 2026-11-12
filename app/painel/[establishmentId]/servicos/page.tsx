import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../lib/establishments";
import { supabaseServer } from "../../../../lib/supabase";
import { ServiceCatalog } from "./service-catalog";

export default async function Services({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ estado?: string; vincular?: string }>;
}) {
  const { establishmentId } = await params;
  if (!isUuid(establishmentId)) notFound();
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?" + new URLSearchParams({ next: `/painel/${establishmentId}/servicos` }));

  const { data: establishment, error: establishmentError } = await supabase.from("barberflow_establishments")
    .select("name,owner_id").eq("id", establishmentId).maybeSingle();
  if (establishmentError) throw new Error("Não foi possível carregar o estabelecimento.");
  if (!establishment) notFound();

  const owner = establishment.owner_id === user.id;
  const [catalog, people, links] = await Promise.all([
    supabase.from("barberflow_services")
      .select("id,name,description,category,price_cents,duration_minutes,active,display_order,photo_path,video_path").is("deleted_at", null)
      .eq("establishment_id", establishmentId).order("active", { ascending: false }).order("display_order").order("name").order("id"),
    owner ? supabase.from("barberflow_professionals").select("id,name,photo_url,active")
      .eq("establishment_id", establishmentId).order("name") : null,
    owner ? supabase.from("barberflow_professional_services").select("professional_id,service_id")
      .eq("establishment_id", establishmentId) : null,
  ]);
  const { estado, vincular } = await searchParams;
  return <ServiceCatalog establishmentId={establishmentId} name={establishment.name} services={catalog.data ?? []}
    failed={Boolean(catalog.error)} estado={estado} assignments={owner ? {
      professionals: people?.data ?? [], links: links?.data ?? [], failed: Boolean(people?.error || links?.error), open: vincular,
    } : undefined} />;
}
