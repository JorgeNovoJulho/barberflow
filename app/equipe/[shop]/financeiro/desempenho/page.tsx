import { PerformanceReport } from "../../../../painel/[establishmentId]/financeiro/desempenho/report";

export default async function Page({ params, searchParams }: {
  params: Promise<{ shop: string }>;
  searchParams: Parameters<typeof PerformanceReport>[0]["searchParams"];
}) {
  const { shop } = await params;
  return <PerformanceReport params={Promise.resolve({ establishmentId: shop })} searchParams={searchParams} delegated />;
}
