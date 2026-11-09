import { CashReport } from "./report";

export default function Page(props: Omit<Parameters<typeof CashReport>[0], "delegated">) {
  return <CashReport {...props} />;
}
