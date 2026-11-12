import { bookingCurrency } from "../../../../lib/public-booking";

type Ranking = { name: string; quantity: number; cents: number };
export type PerformanceSummary = {
  professionals: (Ranking & { professional_id: string })[];
  services: (Ranking & { service_id: string })[];
  hours: { weekday: number; hour: number; quantity: number }[];
};

export function PerformanceCards({ report }: { report: PerformanceSummary }) {
  const slots = new Map(report.hours.map(({ weekday, hour, quantity }) => [weekday * 24 + hour, quantity]));
  const max = Math.max(1, ...slots.values());
  const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const recordedHours = report.hours.map(({ hour }) => hour);
  const first = Math.min(7, ...recordedHours);
  const last = Math.max(22, ...recordedHours);
  const hours = Array.from({ length: last - first + 1 }, (_, index) => index + first);
  const money = (cents: number) => bookingCurrency.format(cents / 100);
  return <div className="cards">
    <section className="card"><h2>Receita por profissional</h2>
      {report.professionals.length ? <ol>{report.professionals.map((row) => <li key={row.professional_id}>{row.name} · {money(row.cents)}</li>)}</ol> : <p>Sem dados no período.</p>}
    </section>
    <section className="card"><h2>Serviços mais vendidos</h2>
      {report.services.length ? <ol>{report.services.map((row) => <li key={row.service_id + ":" + row.name}>{row.name} · {row.quantity} venda(s) · {money(row.cents)}</li>)}</ol> : <p>Sem dados no período.</p>}
    </section>
    <section className="card finance-heatmap"><h2>Dias e horários mais movimentados</h2>
      <p>Atendimentos concluídos por dia da semana e hora de início.</p>
      <div className="finance-heatmap-scroll" tabIndex={0} role="region" aria-label="Mapa de horários">
        <table aria-label="Quantidade de atendimentos por horário">
          <thead><tr><td />{hours.map((hour) => <th scope="col" key={hour}>{hour}h</th>)}</tr></thead>
          <tbody>{[1, 2, 3, 4, 5, 6, 0].map((day) => <tr key={day}>
            <th scope="row">{days[day]}</th>
            {hours.map((hour) => {
              const count = slots.get(day * 24 + hour) ?? 0;
              const level = count ? Math.ceil(3 * count / max) : 0;
              return <td key={hour} data-level={level}>{count}</td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>;
}
