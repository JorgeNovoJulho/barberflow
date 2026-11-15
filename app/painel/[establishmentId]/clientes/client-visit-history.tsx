import { bookingCurrency } from "../../../../lib/currency";
import { ClientAvatar } from "../appointment-card";
import { closedAtLabel } from "../comandas/filters";
import type { Client } from "./client-form";

export type VisitDetails = {
  visits: { id: string; starts: string; service: string; professional: string; paid_cents: number;
    additional_services: string[]; products: { name: string; quantity: number }[] }[];
  frequency: { weekday: number; hour: number; visits: number }[];
};
const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function ClientIdentity({ client, photo }: { client: Client; photo?: string }) {
  return <>
    <h3 className="subscription-business"><ClientAvatar photo={photo} />{client.name}</h3>
    <p>{client.active ? "Ativo" : "Inativo"}{client.phone && " · WhatsApp " + client.phone}</p>
    <p><strong>Código {client.client_number ? "C" + String(client.client_number).padStart(3, "0") : "—"}</strong>
      {" · Cadastro "}{client.created_at ? closedAtLabel(client.created_at) : "sem data registrada"}</p>
  </>;
}

export function ClientVisitHistory({ name, details, error }: { name: string; details: VisitDetails | null; error: boolean }) {
  const maximum = Math.max(1, ...(details?.frequency ?? []).map(row => row.visits));
  return <section className="card panel-form" id="historico">
    <h2>Histórico de {name}</h2>
    {error ? <p role="alert">Não foi possível consultar o histórico.</p> : details?.visits.length ? <ul className="finance-entry-list">
      {details.visits.map(visit => <li key={visit.id}>
        <strong><time dateTime={visit.starts}>{visit.starts.slice(0, 10).split("-").reverse().join("/")} às {visit.starts.slice(11, 16)}</time></strong>
        <p>{[visit.service, ...visit.additional_services].join(" · ")} · {visit.professional}</p>
        {visit.products.length > 0 && <p>Produtos · {visit.products.map(product => product.quantity + " × " + product.name).join(" · ")}</p>}
        <p>Total pago · <strong>{bookingCurrency.format(visit.paid_cents / 100)}</strong></p>
      </li>)}
    </ul> : <p>Nenhum atendimento concluído vinculado.</p>}
    {!error && <section>
      <h3>Dias e horários mais frequentes neste mês</h3>
      {details?.frequency.length ? <ul className="client-frequency">
        {details.frequency.map(row => <li key={row.weekday + "-" + row.hour}>
          <span>{weekdays[row.weekday]} · {String(row.hour).padStart(2, "0")}h</span>
          <meter aria-label="Atendimentos no horário" min={0} max={maximum} value={row.visits} />
          <strong>{row.visits}</strong>
        </li>)}
      </ul> : <p>Nenhuma visita concluída no mês.</p>}
    </section>}
  </section>;
}
