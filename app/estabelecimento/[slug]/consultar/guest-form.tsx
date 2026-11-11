"use client";

import { useActionState, useState } from "react";
import { BookingCode } from "../booking-code";
import { manageGuest } from "./actions";
import { SubmitButton } from "../../../auth/submit";

type Item = { name: string; price: number; units: number };
export type GuestState = { message?: string; success?: boolean; day?: string; slots?: string[]; booking?: {
  code: string; service: string; price: number; start: string; end: string; professional: string; state: string; reason?: string; cancel: boolean; reschedule: boolean; items: Item[];
} };
const states: Record<string,string> = { scheduled: "Confirmado", pending: "Aguardando aprovação", cancelled: "Cancelado", completed: "Concluído", no_show: "Não compareceu" };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (value: string) => value.slice(0, 10).split("-").reverse().join("/");

export function GuestForm({ slug, saved, today }: { slug: string; saved: boolean; today: string }) {
  const [state, action] = useActionState(manageGuest.bind(null, slug), {});
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [day, setDay] = useState("");
  const booking = state.booking;
  const items = booking ? [{ name: booking.service, units: 1, price: booking.price }, ...booking.items] : [];
  return <form className="card account-form panel-form" action={action}>
    <label>Nome usado na reserva <input value={customer} onChange={(e) => setCustomer(e.target.value)} name="customer" maxLength={120} required /></label>
    <label>Telefone com DDD <input value={phone} onChange={(e) => setPhone(e.target.value)} name="phone" type="tel" maxLength={30} required /></label>
    <label>Código da reserva {saved && "(opcional neste navegador)"} <input value={code} onChange={(e) => setCode(e.target.value)} name="code" required={!saved} maxLength={36} autoComplete="off" /></label>
    <SubmitButton name="intent" value="find">Consultar reserva</SubmitButton>
    {state.message && <p role="status" data-feedback={state.success ? "success" : "warning"}>{state.message}</p>}
    {booking && <section>
      <h2>{states[booking.state]}</h2>
      <BookingCode key={booking.code} code={booking.code} />
      <p><strong>{dateLabel(booking.start)} · {booking.start.slice(11,16)}–{booking.end.slice(11,16)}</strong></p>
      <p>Profissional: {booking.professional}</p>
      {booking.reason && <p data-feedback="warning">Motivo: {booking.reason}</p>}
      <ul>{items.map((item, index) => <li key={index}>{item.units} × {item.name} · {money.format(item.price / 100)} por unidade</li>)}</ul>
      <p><strong>Total {money.format(items.reduce((total, item) => total + item.units * item.price, 0) / 100)}</strong></p>
      {booking.reschedule && <details open={Boolean(state.day) || undefined}>
        <summary>Reagendar</summary>
        <label>Nova data <input name="day" type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} /></label>
        <SubmitButton name="intent" value="slots">Buscar horários</SubmitButton>
        {state.day === day && (state.slots?.length ? <>
          <label>Novo horário <select name="slot" defaultValue=""><option value="">Selecione</option>
            {state.slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></label>
          <SubmitButton name="intent" value="reschedule">Confirmar novo horário</SubmitButton>
        </> : <p>Sem horários disponíveis para esta data.</p>)}
      </details>}
      {booking.cancel && <details>
        <summary>Cancelar agendamento</summary>
        <p>Ao confirmar, o horário será liberado na agenda.</p>
        <SubmitButton className="agenda-cancel-button agenda-card-button" name="intent" value="cancel">Confirmar cancelamento</SubmitButton>
      </details>}
    </section>}
  </form>;
}
