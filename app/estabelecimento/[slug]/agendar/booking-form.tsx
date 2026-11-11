"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { offsetDay } from "../../../../lib/agenda";
import { bookingCurrency } from "../../../../lib/currency";
import type { PublicProfile } from "../../../../lib/public-booking";
import { SubmitButton } from "../../../auth/submit";

type Slot = { slot: string };
type Availability = { key: string; error: boolean; slots: Slot[] };
const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" });

function shiftMonth(month: string, offset: number) {
  const date = new Date(month + "-01");
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function Calendar({ day, today, limit, onChange }: {
  day: string; today: string; limit: string; onChange: (value: string) => void;
}) {
  const [month, setMonth] = useState(day.slice(0, 7));
  const first = new Date(month + "-01");
  const nextMonth = shiftMonth(month, 1);
  const count = new Date(offsetDay(nextMonth + "-01", -1)).getUTCDate();
  return <div className="booking-calendar">
    <div className="booking-calendar-nav">
      <button type="button" aria-label="Mês anterior" disabled={month <= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
      <strong aria-live="polite">{monthLabel.format(first)}</strong>
      <button type="button" aria-label="Próximo mês" disabled={month >= limit.slice(0, 7)} onClick={() => setMonth(nextMonth)}>›</button>
    </div>
    <div className="booking-calendar-grid">
      {["D", "S", "T", "Q", "Q", "S", "S"].map((label, index) => <span key={index} aria-hidden="true">{label}</span>)}
      {Array.from({ length: first.getUTCDay() }, (_, index) => <span key={index} aria-hidden="true" />)}
      {Array.from({ length: count }, (_, index) => {
        const date = offsetDay(month + "-01", index);
        return <button type="button" key={date} aria-label={dayLabel.format(new Date(date))}
          aria-pressed={day === date} disabled={date < today || date > limit} onClick={() => onChange(date)}>{index + 1}</button>;
      })}
    </div>
  </div>;
}

function maskPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return "(" + digits;
  const number = digits.slice(2);
  return "(" + digits.slice(0, 2) + ")" + number.slice(0, 5) + (number.length > 5 ? "-" + number.slice(5) : "");
}

export function BookingForm({ slug, services, initialService, initialPerson, day, today, limit, initialSlots, initialName, action, requestId }: {
  slug: string; services: PublicProfile["services"]; initialService: string; initialPerson: string;
  day: string; today: string; limit: string; initialSlots: Slot[] | null; initialName: string;
  action: (data: FormData) => Promise<void>; requestId: string;
}) {
  const [serviceId, setService] = useState(initialService);
  const [personId, setPerson] = useState(initialPerson);
  const [selectedDay, setDay] = useState(day);
  const [time, setTime] = useState("");
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [revision, setRevision] = useState(0);
  const service = services.find((entry) => entry.id === serviceId);
  const person = service?.professionals.find((entry) => entry.id === personId);
  const key = JSON.stringify([serviceId, personId, selectedDay]);
  const [check, setCheck] = useState<Availability | null>(() => initialSlots
    ? { key, error: false, slots: initialSlots } : null);

  useEffect(() => {
    if (!person) return;
    const refresh = () => {
      if (document.visibilityState === "visible") setRevision((value) => value + 1);
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [person]);

  useEffect(() => {
    if (!person || !serviceId) return;
    let current = true;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const token = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !token) {
      setCheck({ key, error: true, slots: [] });
      return;
    }
    void createBrowserClient(url, token).rpc("barberflow_public_slots", {
      profile_slug: slug, professional: person.id, service: serviceId, booking_day: selectedDay,
    }).then(({ data, error }) => {
      if (current) setCheck({ key, error: !!error, slots: error ? [] : data ?? [] });
    });
    return () => { current = false; };
  }, [slug, person, serviceId, selectedDay, key, revision]);

  const availability = check?.key === key ? check : null;
  const slots = person ? availability?.slots ?? [] : [];
  const timeValid = slots.some(({ slot }) => slot.slice(11, 16) === time);
  const nameValid = !!name.trim();
  const phoneValid = /^[1-9]\d9\d{8}$/.test(phone.replace(/\D/g, ""));
  const activeStep = !service ? 0 : !person ? 1 : !timeValid ? 2 : 3;
  const stepState = (index: number) => index === activeStep ? "current" : index < activeStep ? "done" : "next";
  const guidance = !service ? "Escolha um serviço."
    : !person ? "Escolha quem vai atender você."
    : !timeValid ? "Confira a data e escolha um horário livre."
    : !nameValid ? "Preencha seu nome."
    : !phoneValid ? "Informe seu WhatsApp com DDD."
    : "Tudo pronto. Confira o resumo e confirme seu agendamento.";
  const price = service ? bookingCurrency.format(service.price_cents / 100) : "—";
  const suggested = !service && services.filter((entry) => entry.professionals.some(({ id }) => id === initialPerson));
  const listedServices = suggested && suggested.length ? suggested : services;

  return <form className="booking-workspace" action={action}>
    <ol className="booking-steps" aria-label="Etapas do agendamento">
      {["Serviço", "Profissional", "Data e hora", "Confirmar"].map((label, index) =>
        <li key={label} data-step={stepState(index)} aria-current={index === activeStep ? "step" : undefined}>
          <span aria-hidden="true">{index < activeStep ? "✓" : index + 1}</span>
          {label}{index < activeStep && <small>Concluído</small>}
        </li>)}
    </ol>
    <p className="booking-guidance" role="status"><strong>Passo {activeStep + 1} de 4</strong> {guidance}</p>
    <div className="booking-board">
      <fieldset className="booking-column" data-step={stepState(0)}>
        <legend>Escolha o serviço</legend>
        {!listedServices.length && <p>Nenhum serviço disponível para agendamento.</p>}
        {listedServices.map((entry) => <label className="booking-choice" key={entry.id}>
          <input type="radio" name="service" value={entry.id} checked={serviceId === entry.id} onChange={() => {
            setService(entry.id);
            if (!entry.professionals.some(({ id }) => id === personId)) setPerson("");
            setTime("");
          }} />
          <span><strong>{entry.name}</strong><small>{bookingCurrency.format(entry.price_cents / 100)} · {entry.duration_minutes} min</small></span>
        </label>)}
      </fieldset>
      <fieldset className="booking-column" data-step={stepState(1)}>
        <legend>Escolha o profissional</legend>
        {!service && <p>Escolha um serviço para ver a equipe disponível.</p>}
        {service?.professionals.map(({ id, name, photo_url }) => <label className="booking-choice" key={id}>
          <input type="radio" name="professional" value={id} checked={personId === id} onChange={() => { setPerson(id); setTime(""); }} />
          {photo_url ? <img className="booking-avatar" src={photo_url} alt="" width={36} height={36} loading="lazy" />
            : <span className="booking-avatar booking-avatar-fallback" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>}
          <strong>{name}</strong>
        </label>)}
      </fieldset>
      <fieldset className="booking-column" data-step={stepState(2)} disabled={!person}>
        <legend>Escolha a data e o horário</legend>
        <input type="hidden" name="day" value={selectedDay} />
        <Calendar day={selectedDay} today={today} limit={limit} onChange={(value) => { setDay(value); setTime(""); }} />
        <p role="status">{!person ? "Escolha um profissional para consultar os horários."
          : !availability ? "Consultando horários…"
          : availability.error ? "Não foi possível consultar os horários."
          : !slots.length ? "Não há horários livres neste dia. Escolha outra data."
          : "Selecione um dos horários disponíveis."}</p>
        {availability?.error && <button type="button" className="secondary" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</button>}
        {!!slots.length && <fieldset className="booking-time-list">
          <legend>Horários disponíveis</legend>
          {slots.map(({ slot }) => {
            const hour = slot.slice(11, 16);
            return <label key={slot}><input type="radio" name="slot" value={hour} checked={time === hour}
              onChange={() => setTime(hour)} />{hour}</label>;
          })}
        </fieldset>}
      </fieldset>
      <div className="booking-column booking-review" data-step={stepState(3)}>
        <h2>Resumo do agendamento</h2>
        <dl className="order-totals">
          <div><dt>Serviço</dt><dd>{service?.name ?? "—"}</dd></div>
          <div><dt>Profissional</dt><dd>{person?.name ?? "—"}</dd></div>
          <div><dt>Data</dt><dd>{person ? selectedDay.split("-").reverse().join("/") : "—"}</dd></div>
          <div><dt>Horário</dt><dd>{timeValid ? time : "—"}</dd></div>
          <div><dt>Duração</dt><dd>{service ? service.duration_minutes + " min" : "—"}</dd></div>
          <div><dt>Total</dt><dd><strong>{price}</strong></dd></div>
        </dl>
        <input type="hidden" name="requestId" value={requestId} />
        <div className="account-form">
          <label>Nome <input name="customer" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)}
            className={timeValid && !nameValid ? "booking-field-required" : undefined} autoComplete="name" /></label>
          <label>WhatsApp <input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required
            value={phone} onChange={(event) => setPhone(maskPhone(event.target.value))} placeholder="(99)99999-9999"
            className={timeValid && nameValid && !phoneValid ? "booking-field-required" : undefined} /></label>
          <p role="status">{!timeValid ? "Selecione um horário para continuar." : !nameValid ? "Preencha seu nome."
            : !phoneValid ? "Informe seu WhatsApp com DDD e nove dígitos." : "Confira o resumo e confirme."}</p>
          <SubmitButton className="booking-confirm" disabled={!timeValid || !nameValid || !phoneValid}>Confirmar agendamento</SubmitButton>
        </div>
      </div>
    </div>
  </form>;
}
