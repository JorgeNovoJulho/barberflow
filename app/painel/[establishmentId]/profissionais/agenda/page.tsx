import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "../../../../../lib/supabase";
import { isUuid } from "../../../../../lib/establishments";
import { offsetDay, saoPauloToday, validDay } from "../../../../../lib/agenda";

const periods = { dia: "Dia", semana: "Semana", quinzena: "Quinzena", mes: "Mensal" };
const statuses: Record<string, string> = { scheduled: "Agendado", pending: "Aguardando aprovação", completed: "Concluído", cancelled: "Cancelado", no_show: "Falta" };

export default async function Page({ params, searchParams }: {
  params: Promise<{ establishmentId: string }>;
  searchParams: Promise<{ profissional?: string; periodo?: string; dia?: string; pagina?: string }>;
}) {
  const { establishmentId: shop } = await params;
  const { profissional, periodo, dia, pagina } = await searchParams;
  if (!isUuid(shop) || !profissional || !isUuid(profissional)) notFound();
  const client = await supabaseServer();
  const user = (await client?.auth.getUser())?.data.user;
  if (!client || !user) notFound();
  const { data: business } = await client.from("barberflow_establishments").select("id").eq("id", shop).eq("owner_id", user.id).maybeSingle();
  if (!business) notFound();
  const { data: person } = await client.from("barberflow_professionals").select("name").eq("establishment_id", shop).eq("id", profissional).maybeSingle();
  if (!person) notFound();

  const period = periodo && Object.hasOwn(periods, periodo) ? periodo : "dia";
  const day = dia && validDay(dia) ? dia : saoPauloToday();
  const month = day.slice(0, 7) + "-01";
  const nextMonth = offsetDay(month, 32).slice(0, 7) + "-01";
  const monday = offsetDay(day, -((new Date(day).getUTCDay() + 6) % 7));
  const firstHalf = day.slice(-2) <= "15";
  const start = period === "semana" ? monday : period === "mes" ? month : period === "quinzena" ? (firstHalf ? month : offsetDay(month, 15)) : day;
  const end = period === "semana" ? offsetDay(monday, 7) : period === "mes" ? nextMonth : period === "quinzena" ? (firstHalf ? offsetDay(month, 15) : nextMonth) : offsetDay(day, 1);
  const page = /^\d{1,5}$/.test(pagina ?? "") ? Number(pagina) : 0;
  const size = 30;
  const { data, error } = await client.from("barberflow_schedule").select("id,starts_at,service_name,client_name,state")
    .eq("establishment_id", shop).eq("professional_id", profissional).eq("kind", "appointment")
    .gte("starts_at", start + "T00:00").lt("starts_at", end + "T00:00")
    .order("starts_at").order("id").range(page * size, (page + 1) * size);
  const href = (value: string, index = 0) => "?" + new URLSearchParams({ profissional, periodo: value, dia: day, pagina: String(index) });
  const dateLabel = (value: string) => value.slice(0, 10).split("-").reverse().join("/");
  return <section className="section">
    <Link href={`/painel/${shop}/profissionais#profissional-${profissional}`}>Voltar à equipe</Link>
    <h1>Agendamentos de {person.name}</h1>
    <nav className="account-links" aria-label="Período">{Object.entries(periods).map(([value, label]) =>
      <Link key={value} className="secondary" aria-current={period === value ? "page" : undefined} href={href(value)}>{label}</Link>)}</nav>
    <form className="agenda-date">
      <input type="hidden" name="profissional" value={profissional} />
      <input type="hidden" name="periodo" value={period} />
      <label>Data de referência <input type="date" name="dia" defaultValue={day} required /></label>
      <button className="secondary">Consultar</button>
    </form>
    <p>{dateLabel(start)} a {dateLabel(offsetDay(end, -1))}</p>
    {error ? <p role="alert">Não foi possível carregar os agendamentos.</p>
      : !data?.length ? <p>Nenhum agendamento neste período.</p>
      : <ul className="professional-appointments">{data.slice(0, size).map((item) =>
        <li className="card" key={item.id} data-state={item.state}>
          <strong>{dateLabel(item.starts_at)} às {item.starts_at.slice(11, 16)}</strong>
          <h2>{item.client_name}</h2><p>{item.service_name} · {statuses[item.state] ?? item.state}</p>
          <Link href={`/painel/${shop}/agenda?dia=${item.starts_at.slice(0, 10)}#registro-${item.id}`}>Ver na agenda</Link>
        </li>)}</ul>}
    <nav className="account-links" aria-label="Páginas de agendamentos">
      {page > 0 && <Link className="secondary" href={href(period, page - 1)}>Anterior</Link>}
      {(data?.length ?? 0) > size && <Link className="secondary" href={href(period, page + 1)}>Próxima</Link>}
    </nav>
  </section>;
}
