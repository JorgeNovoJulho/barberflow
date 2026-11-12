import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isUuid } from "../../../../lib/establishments";
import { bookingCurrency } from "../../../../lib/public-booking";
import { supabaseServer } from "../../../../lib/supabase";
import { SubmitButton } from "../../../auth/submit";

const periods = { dia: "Dia", semana: "Semana", quinzena: "Quinzenal", mes: "Mensal" };
type Appointment = { id: string; client: string; phone: string | null; service: string; starts: string; state: string };
type Panel = {
  name: string; business: string; photo: string | null; cover: string | null; today: string;
  available: boolean; services: string[]; service_rate: number; product_rate: number;
  appointments: Appointment[]; attended: number; absent: number; paid_services: number; sold_products: number;
  hours: { weekday: number; hour: number; quantity: number }[];
  daily: { services: number; products: number; service_units: number; product_units: number; service_commission: number; product_commission: number };
};
const money = (value: number) => bookingCurrency.format(value / 100);
const dayLabel = (value: string) => value.slice(0, 10).split("-").reverse().join("/");
const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

async function client(shop: string) {
  if (!isUuid(shop)) notFound();
  const supabase = await supabaseServer();
  if (!supabase || !(await supabase.auth.getUser()).data.user) redirect("/login?" + new URLSearchParams({ next: `/equipe/${shop}/meu-painel` }));
  return supabase;
}

async function changeDay(shop: string, available: boolean) {
  "use server";
  const supabase = await client(shop);
  const { data, error } = await supabase.rpc("barberflow_set_professional_day", { shop_id: shop, available_now: available });
  revalidatePath(`/equipe/${shop}/meu-painel`);
  redirect(`/equipe/${shop}/meu-painel?estado=${data && !error ? "salvo" : "falha"}`);
}

async function appointmentAction(shop: string, id: string, operation: "cancel" | "absence", form: FormData) {
  "use server";
  if (!isUuid(id)) notFound();
  const supabase = await client(shop);
  const reason = String(form.get("reason") ?? "").trim();
  const { data, error } = await supabase.rpc("barberflow_professional_appointment", {
    shop_id: shop, entry_id: id, operation, reason: reason || null,
  });
  revalidatePath(`/equipe/${shop}/meu-painel`);
  redirect(`/equipe/${shop}/meu-painel?estado=${data && !error ? "salvo" : "falha"}#agenda-dia`);
}

function media(value: string | null) {
  return value?.startsWith("https://") ? value : undefined;
}

export default async function ProfessionalPanel({ params, searchParams }: {
  params: Promise<{ shop: string }>;
  searchParams: Promise<{ periodo?: string; estado?: string; pagina?: string }>;
}) {
  const { shop } = await params;
  const supabase = await client(shop);
  const { periodo, estado, pagina } = await searchParams;
  const period = typeof periodo === "string" && Object.hasOwn(periods, periodo) ? periodo : "dia";
  const { data, error } = await supabase.rpc("barberflow_professional_panel", { shop_id: shop, period });
  if (error) throw new Error("Não foi possível carregar seu painel.");
  if (!data) notFound();
  const panel = data as Panel;
  const base = `/equipe/${shop}/meu-painel`;
  const active = panel.appointments.filter((entry) => entry.state === "scheduled" || entry.state === "pending");
  const page = typeof pagina === "string" && /^\d{1,4}$/.test(pagina) ? Math.min(Number(pagina), Math.max(0, Math.ceil(panel.appointments.length / 12) - 1)) : 0;
  return <section className="container section professional-workspace">
    <Link href={`/equipe/${shop}`}>Agenda da equipe</Link>
    <header className="card professional-identity">
      <div className="professional-cover">{media(panel.cover) && <img src={media(panel.cover)} alt="" decoding="async" />}</div>
      {media(panel.photo) && <img className="professional-photo" src={media(panel.photo)} alt="" loading="lazy" width={72} height={72} />}
      <p className="eyebrow">{panel.business}</p>
      <h1>{panel.name}</h1>
      <p>{panel.services.length ? panel.services.join(" · ") : "Sem serviços vinculados."}</p>
      <p>Comissão de serviços {panel.service_rate / 100}% · Comissão de produtos {panel.product_rate / 100}%</p>
      <p><strong>{panel.available ? "Disponível hoje" : "Indisponível hoje"}</strong></p>
      {panel.available ? <details><summary className="secondary">Fechar Dia</summary>
        <form action={changeDay.bind(null, shop, false)}>
          <p>Fechar a disponibilidade para novos agendamentos online de hoje?</p>
          <SubmitButton>Confirmar fechamento</SubmitButton>
        </form>
      </details> : <form action={changeDay.bind(null, shop, true)}><SubmitButton>Iniciar Dia</SubmitButton></form>}
    </header>
    {estado && <p role={estado === "salvo" ? "status" : "alert"}>{estado === "salvo" ? "Alteração salva." : "Não foi possível concluir a operação."}</p>}
    <div className="professional-daily">
      <section className="card"><h2>Serviços hoje</h2><p>{panel.daily.service_units} · {money(panel.daily.services)}</p>
        <strong>A receber {money(panel.daily.service_commission)}</strong></section>
      <section className="card"><h2>Produtos hoje</h2><p>{panel.daily.product_units} · {money(panel.daily.products)}</p>
        <strong>A receber {money(panel.daily.product_commission)}</strong></section>
    </div>
    <details className="card" id="agenda-dia" open={Boolean(estado || page)}>
      <summary>Agendamentos do dia · {panel.appointments.length}{active[0] ? ` · Primeiro às ${active[0].starts.slice(11,16)}` : ""}</summary>
      <ul className="finance-entry-list">{panel.appointments.slice(page * 12, page * 12 + 12).map((entry) => {
        const digits = entry.phone?.replace(/\D/g, "") ?? "";
        return <li className="card" key={entry.id}>
          <strong>{dayLabel(entry.starts)} às {entry.starts.slice(11,16)}</strong>
          <h3>{entry.client}</h3><p>{entry.service}</p>
          {digits && <a href={`https://wa.me/${digits.length <= 11 ? "55" + digits : digits}`}>WhatsApp</a>}
          {(entry.state === "scheduled" || entry.state === "pending") && <div className="finance-entry-actions">
            <details><summary>Informar falta</summary><form action={appointmentAction.bind(null, shop, entry.id, "absence")}>
              <SubmitButton>Confirmar falta</SubmitButton></form></details>
            <details><summary>Cancelar agendamento</summary><form className="account-form" action={appointmentAction.bind(null, shop, entry.id, "cancel")}>
              <label>Motivo <textarea name="reason" maxLength={500} required /></label><SubmitButton>Confirmar cancelamento</SubmitButton>
            </form></details>
          </div>}
        </li>;
      })}</ul>
      {page > 0 && <Link className="secondary" href={`${base}?periodo=${period}&pagina=${page-1}#agenda-dia`}>Anterior</Link>}
      {(page + 1) * 12 < panel.appointments.length && <Link className="secondary" href={`${base}?periodo=${period}&pagina=${page+1}#agenda-dia`}>Próxima</Link>}
    </details>
    <section className="card" id="desempenho">
      <h2>Desempenho</h2>
      <nav className="account-links" aria-label="Período do desempenho">{Object.entries(periods).map(([key, label]) =>
        <Link key={key} className="secondary" aria-current={period === key ? "page" : undefined} href={`${base}?periodo=${key}#desempenho`}>{label}</Link>)}</nav>
      <dl>
        <dt>Serviços fechados e pagos</dt><dd>{panel.paid_services}</dd>
        <dt>Atendimentos concluídos</dt><dd>{panel.attended}</dd>
        <dt>Faltas</dt><dd>{panel.absent}</dd>
        <dt>Produtos vendidos</dt><dd>{panel.sold_products}</dd>
      </dl>
      <h3>Dias e horários de pico</h3>
      {panel.hours.length ? <ul className="professional-peaks">{panel.hours.map(({ weekday, hour, quantity }) =>
        <li key={weekday * 24 + hour}><span>{days[weekday - 1]} · {hour}h</span><meter min={0} max={Math.max(...panel.hours.map((row) => row.quantity))} value={quantity} aria-label="Atendimentos concluídos" /><strong>{quantity}</strong></li>)}</ul>
        : <p>Sem atendimentos concluídos no período.</p>}
    </section>
  </section>;
}
