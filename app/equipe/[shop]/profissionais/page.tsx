import { ProfessionalManager } from "../../../painel/[establishmentId]/profissionais/professional-manager";

export default async function TeamProfessionals({ params, searchParams }: {
  params: Promise<{ shop: string }>; searchParams: Promise<{ estado?: string }>;
}) {
  const { shop } = await params;
  return <ProfessionalManager params={Promise.resolve({ establishmentId: shop })} searchParams={searchParams} delegated />;
}
