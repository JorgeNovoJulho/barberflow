import Link from "next/link";
import { redirect } from "next/navigation";
import { bookingCurrency } from "../../lib/public-booking";
import { supabaseServer } from "../../lib/supabase";
import { saoPauloToday, validDay } from "../../lib/agenda";
import { SubmitButton } from "../auth/submit";
import { changeBooking, submitReview } from "./actions";

const states: Record<string, string> = {
  pending: "Aguardando aprovação", scheduled: "Agendado", completed: "Concluído", cancelled: "Cancelado", no_show: "Não compareceu",
};

const feedback: Record<string, string> = {
  registrado: "Reserva registrada. Confira abaixo se foi confirmada ou aguarda aprovação.",
  cancelado: "Reserva cancelada.",
  remarcado: "Reserva remarcada. Confira a data e o status atualizados.",
  indisponivel: "Não foi possível alterar a reserva. Confira o prazo ou escolha outro horário.",
  avaliado: "Sua avaliação foi registrada.",
  "avaliacao-invalida": "Não foi possível avaliar. Confira os dados e se o atendimento já foi avaliado.",
};

type Booking = { id: string; shop_name: string; service_name: string; starts_at: string; state: string; price_cents: number; can_cancel: boolean; can_reschedule: boolean };

export default async function MyBookings({ searchParams }: { searchParams: Promise<{ estado?: string; remarca?: string; dia?: string }> }) {
  const supabase = await supabaseServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user) redirect("/login?next=%2Fmeus-agendamentos");
  const { data, error } = await supabase.rpc("barberflow_my_bookings");
  const { estado, remarca, dia } = await searchParams;
  const bookings = (data ?? []) as Booking[];
  const today = saoPauloToday();
  const selected = bookings.find((booking) => booking.id === remarca && booking.can_reschedule);
  const day = typeof dia === "string" && validDay(dia) && dia >= today ? dia : null;
  const alternatives = selected && day ? await supabase.rpc("barberflow_customer_reschedule_slots", {
    entry: selected.id, booking_day: day,
  }) : null;
  const slots = (alternatives?.data ?? []) as { slot: string }[];
  return <section className="container section">
    <Link href="/estabelecimentos">Ver estabelecimentos</Link>
    <h1>Meus agendamentos</h1>
    {estado && Object.hasOwn(feedback, estado) && <p role="status">{feedback[estado]}</p>}
    {error ? <p role="alert">Não foi possível carregar os agendamentos.</p>
      : bookings.length ? <ul className="cards">{bookings.map((booking) => <li key={booking.id} className="card">
        <h2>{booking.service_name}</h2>
        <p>{booking.shop_name}</p>
        <p>{booking.starts_at.slice(0, 10).split("-").reverse().join("/")} às {booking.starts_at.slice(11, 16)} · {states[booking.state]}</p>
        <p>{bookingCurrency.format(booking.price_cents / 100)}</p>
        {booking.state === "completed" && <details>
          <summary>Avaliar atendimento</summary>
          <form className="account-form" action={submitReview.bind(null, booking.id)}>
            <label>Nota <select name="stars" defaultValue="" required>
              <option value="" disabled>Selecione</option>
              {[5, 4, 3, 2, 1].map((stars) => <option key={stars} value={stars}>{stars}/5</option>)}
            </select></label>
            <label>Comentário <textarea name="message" maxLength={500} rows={3} /></label>
            <SubmitButton>Enviar avaliação</SubmitButton>
          </form>
        </details>}
        {booking.can_reschedule && <details open={selected?.id === booking.id}>
          <summary>Remarcar</summary>
          <form className="account-form" action="/meus-agendamentos">
            <input type="hidden" name="remarca" value={booking.id} />
            <label>Nova data <input type="date" name="dia" min={today} defaultValue={selected?.id === booking.id && day ? day : today} required /></label>
            <button className="secondary" type="submit">Buscar novos horários</button>
          </form>
          {selected?.id === booking.id && day && (alternatives?.error ? <p role="alert">Não foi possível consultar os horários.</p>
            : slots.length ? <form className="account-form" action={changeBooking.bind(null, booking.id, day)}>
              <fieldset className="booking-slots"><legend>Novo horário</legend>
                {slots.map(({ slot }) => <label key={slot}><input name="slot" type="radio" value={slot.slice(11, 16)} required /> {slot.slice(11, 16)}</label>)}
              </fieldset>
              <SubmitButton>Confirmar remarcação</SubmitButton>
            </form> : <p>Nenhum horário disponível nessa data.</p>)}
        </details>}
        {booking.can_cancel && <details>
          <summary>Cancelar reserva</summary>
          <form className="account-links" action={changeBooking.bind(null, booking.id, null)}>
            <SubmitButton>Confirmar cancelamento</SubmitButton>
          </form>
        </details>}
      </li>)}</ul> : <p>Você ainda não fez reservas online.</p>}
  </section>;
}
