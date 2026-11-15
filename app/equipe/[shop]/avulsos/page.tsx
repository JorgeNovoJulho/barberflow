import { Checkout, type CheckoutQuery } from "../../../painel/[establishmentId]/caixa/checkout";

export default async function WalkInPage({params,searchParams}:{
  params:Promise<{shop:string}>; searchParams:Promise<CheckoutQuery>;
}) {
  const { shop } = await params;
  return <Checkout shop={shop} args={await searchParams} professional />;
}
