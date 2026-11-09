import { CashReport } from "../../../../painel/[establishmentId]/financeiro/relatorios/report";

export default async function Page({ params, searchParams }: {
  params: Promise<{ shop: string }>;
  searchParams: Parameters<typeof CashReport>[0]["searchParams"];
}) {
  const { shop } = await params;
  return <CashReport params={Promise.resolve({ establishmentId: shop })} searchParams={searchParams} delegated />;
}
