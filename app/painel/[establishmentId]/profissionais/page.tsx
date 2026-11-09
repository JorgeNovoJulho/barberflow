import { ProfessionalManager } from "./professional-manager";

export default function Professionals(props: Omit<Parameters<typeof ProfessionalManager>[0], "delegated">) {
  return <ProfessionalManager {...props} />;
}
