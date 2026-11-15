import { Checkout, type CheckoutQuery } from "./checkout";

export default async function CheckoutPage({params,searchParams}:{
  params:Promise<{establishmentId:string}>; searchParams:Promise<CheckoutQuery>;
}) {
  const { establishmentId } = await params;
  return <Checkout shop={establishmentId} args={await searchParams} />;
}
