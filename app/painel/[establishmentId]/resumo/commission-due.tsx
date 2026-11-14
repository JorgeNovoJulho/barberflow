import Link from "next/link";
import { offsetDay, saoPauloToday } from "../../../../lib/agenda";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";

type Payout = { professional: string; cadence: string; first_day: number | null; second_day: number | null };
type Order = { professional_id: string; receipt_id?: string; service_commission: number; product_commission: number };
const periods: Record<string, string> = { daily: "dia", weekly: "semana", fortnightly: "quinzena", monthly: "mes" };

function dueDate(today: string, payout: Payout) {
  if (payout.cadence === "daily") return today;
  const date = new Date(today + "T12:00:00Z");
  if (payout.cadence === "weekly") {
    return offsetDay(today, (payout.first_day ?? 1) - (date.getUTCDay() || 7));
  }
  const requested = payout.cadence === "fortnightly" && date.getUTCDate() > 15 ? payout.second_day : payout.first_day;
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return today.slice(0, 8) + String(Math.min(requested ?? 1, last)).padStart(2, "0");
}

export async function CommissionDue({ shop }: { shop: string }) {
  const client = await supabaseServer();
  if (!client) return null;
  const { data, error } = await client.rpc("barberflow_owner_professional_payouts", { shop_id: shop });
  if (error) return <p role="status">Não foi possível consultar os repasses.</p>;
  const payouts = (data ?? []) as Payout[];
  if (!payouts.length) return null;
  const today = saoPauloToday();
  const [people, ...reports] = await Promise.all([
    client.from("barberflow_professionals").select("id,name,photo_url").eq("establishment_id", shop),
    ...Object.entries(periods).filter(([cadence]) => payouts.some(row => row.cadence === cadence)).map(async ([cadence, period]) => ({
      cadence, result: await client.rpc("barberflow_commission_report", { shop_id: shop, period, reference_day: today }),
    })),
  ]);
  if (people.error || reports.some(report => report.result.error || !report.result.data)) {
    return <p role="status">Não foi possível atualizar os valores de comissões.</p>;
  }
  return <section className="card panel-form">
    <h2>Vencimentos de comissões</h2>
    <ul className="cards">{payouts.map(payout => {
      const person = people.data.find(row => row.id === payout.professional);
      if (!person) return null;
      const report = reports.find(row => row.cadence === payout.cadence);
      const orders = (report?.result.data?.orders ?? []) as Order[];
      const amount = orders.filter(row => row.professional_id === person.id && !row.receipt_id)
        .reduce((sum, row) => sum + (row.service_commission ?? 0) + (row.product_commission ?? 0), 0);
      const due = dueDate(today, payout);
      return <li className="card" key={person.id}>
        <h3 className="subscription-business">{person.photo_url && <img className="booking-avatar" src={person.photo_url} width={36} height={36} alt="" loading="lazy" />}{person.name}</h3>
        <p><strong>{bookingCurrency.format(amount / 100)}</strong> em aberto no período</p>
        <p><time dateTime={due}>{due.split("-").reverse().join("/")}</time>{amount > 0 && due <= today && <strong> · {due === today ? "Vence hoje" : "Vencido"}</strong>}</p>
        <Link className="secondary" href={`/painel/${shop}/caixa?aba=comissoes&periodo=${periods[payout.cadence]}&data=${today}`}>Conferir repasse</Link>
      </li>;
    })}</ul>
  </section>;
}
