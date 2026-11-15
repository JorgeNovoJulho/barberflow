import { bookingCurrency } from "../../../../lib/currency";
import { ClientAvatar } from "../appointment-card";
import { closedAtLabel } from "../comandas/filters";
import type { Client } from "./client-form";

type RankedItem = { name: string; quantity: number; position: number };

type ClientOrder = {
  id: string; number: string; starts: string; state: string; service: string; professional: string | null; matched_by_phone?: boolean;
  closed_at: string | null; total_cents: number; paid_cents: number;
  services: { name: string; cents: number }[]; products: { name: string; cents: number; quantity: number }[];
};

export type VisitDetails = {
  orders?: ClientOrder[];
  top_services?: RankedItem[]; top_products?: RankedItem[];
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

function ClientRanking({ title, items, unit }: { title: string; items?: RankedItem[]; unit: string }) {
  return <section>
    <h3>{title}</h3>
    {items?.length ? <ul className="finance-entry-list">{items.map(item => <li key={item.position}>
      <strong>{item.position}º · {item.name}</strong> · {item.quantity} {unit}
    </li>)}</ul> : <p>Sem registros para o ranking.</p>}
  </section>;
}

export function ClientVisitHistory({ name, details, error }: { name: string; details: VisitDetails | null; error: boolean }) {
  const maximum = Math.max(1, ...(details?.frequency ?? []).map(row => row.visits));
  return <section className="panel-form" id="historico">
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
      <h3>Comandas do cliente</h3>
      {details?.orders?.length ? [...details.orders].sort((a, b) => b.starts.localeCompare(a.starts)).map(order => <details key={order.id}>
        <summary className="secondary finance-tab command-action" data-tone="blue">Comanda {order.number}</summary>
        <p><time dateTime={order.starts}>{order.starts.slice(0, 10).split("-").reverse().join("/")} às {order.starts.slice(11, 16)}</time>{order.professional && " · " + order.professional}</p>
        {order.matched_by_phone && <p>Localizada pelo WhatsApp cadastrado</p>}
        <p>{order.state === "cancelled" ? "Cancelada" : order.state === "no_show" ? "Falta" : order.closed_at ? "Fechada em " + closedAtLabel(order.closed_at) : "Em aberto"}</p>
        <ul className="finance-entry-list">
          <li>{order.service}</li>
          {order.services.map((item, index) => <li key={"service-" + index}>{item.name} · {bookingCurrency.format(item.cents / 100)}</li>)}
          {order.products.map((item, index) => <li key={"product-" + index}>{item.quantity} × {item.name} · {bookingCurrency.format(item.cents / 100)}</li>)}
        </ul>
        <p><strong>Total {bookingCurrency.format(order.total_cents / 100)}</strong> · Pago {bookingCurrency.format(order.paid_cents / 100)}</p>
      </details>) : <p>Nenhuma comanda vinculada ao cadastro.</p>}
    </section>}
    {!error && <div className="form-columns">
      <ClientRanking title="Serviços mais utilizados" items={details?.top_services} unit="atendimento(s)" />
      <ClientRanking title="Produtos mais comprados" items={details?.top_products} unit="un." />
    </div>}
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
