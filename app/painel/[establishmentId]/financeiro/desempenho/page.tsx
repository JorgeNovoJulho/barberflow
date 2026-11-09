import { PerformanceReport } from "./report";

export default function Page(props: Omit<Parameters<typeof PerformanceReport>[0], "delegated">) {
  return <PerformanceReport {...props} />;
}
