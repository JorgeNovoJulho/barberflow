import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../../../../lib/establishments";
import type { PublicProfile } from "../../../../../lib/public-booking";
import { supabaseServer } from "../../../../../lib/supabase";
import { ProfileView } from "../../../../estabelecimento/[slug]/profile-view";

export default async function PublicationPreview({ params }: { params: Promise<{ establishmentId: string }> }) {
  const { establishmentId: shop } = await params;
  if (!isUuid(shop)) notFound();
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) {
    redirect("/login?" + new URLSearchParams({ next: `/painel/${shop}/publicacao/previa` }));
  }
  const result = await supabase.rpc("barberflow_preview_business", { shop });
  if (result.error) throw new Error("Não foi possível carregar a prévia.");
  if (!result.data) notFound();
  return <ProfileView profile={result.data as PublicProfile} previewShop={shop} />;
}
