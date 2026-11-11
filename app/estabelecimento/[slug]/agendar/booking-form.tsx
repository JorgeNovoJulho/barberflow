"use client";

import { useEffect, useState } from "react";
import { SubmitButton } from "../../../auth/submit";
import { createBrowserClient } from "@supabase/ssr";

type Slot = { slot: string };

export function BookingDate({ slug, service, professionals, day, professional, today, limit, initialSlots, contact }: {
  slug: string; service: string; professionals: { id: string; name: string }[];
  day: string; professional: string; today: string; limit: string; initialSlots: Slot[] | null; contact: { initialName: string; action: (data: FormData) => Promise<void>; requestId: string };
}) {
  const [selectedDay, setDay] = useState(day);
  const [selectedPerson, setPerson] = useState(professional);
  const [check, setCheck] = useState<{ key: string; available: boolean; error: boolean; slots: Slot[] } | null>(
    initialSlots ? { key: professional + day, available: initialSlots.length > 0, error: false, slots: initialSlots } : null);
  const valid = !!selectedPerson && !!selectedDay && selectedDay >= today && selectedDay <= limit;
  const key = selectedPerson + selectedDay;
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setRevision((value) => value + 1); };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  useEffect(() => {
    if (!valid) return;
    let current = true;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const token = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !token) { setCheck({ key, available: false, error: true, slots: [] }); return; }
    const supabase = createBrowserClient(url, token);
    void supabase.rpc("barberflow_public_slots", {
      profile_slug: slug, professional: selectedPerson, service, booking_day: selectedDay,
    }).then(({ data, error }) => {
      if (current) setCheck({ key, available: !error && !!data?.length, error: !!error, slots: data ?? [] });
    });
    return () => { current = false; };
  }, [slug, service, selectedDay, selectedPerson, key, valid, revision]);

  const ready = valid && check?.key === key && check.available;
  const message = !selectedPerson ? "Selecione o profissional."
    : !selectedDay ? "Selecione a data."
    : selectedDay < today || selectedDay > limit ? "Escolha uma data dentro do período disponível."
    : check?.key !== key ? "Verificando horários disponíveis…"
    : check.error ? "Não foi possível conferir a data. Tente novamente."
    : !check.available ? "Não há horários disponíveis neste dia. O expediente pode ter encerrado ou os horários estão ocupados. Escolha outro dia."
    : "Data disponível. Clique em Buscar horários para escolher seu atendimento.";
  return <>
    <div className="card booking-panel">
      <h2>Profissional e data</h2>
      <form className="account-form" action={`/estabelecimento/${slug}/agendar`}>
        <input type="hidden" name="servico" value={service} />
        <label>Profissional <select name="profissional" required value={selectedPerson} onChange={(event) => setPerson(event.target.value)}>
          <option value="" disabled>Selecione</option>
          {professionals.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Data <input name="dia" type="date" required min={today} max={limit} value={selectedDay} onChange={(event) => setDay(event.target.value)} aria-describedby="booking-date-help" /></label>
        <p id="booking-date-help" role="status" className={!ready && check?.key === key ? "booking-field-help" : undefined}>{message}</p>
        <button type="submit" className="primary" disabled={!ready}>Buscar horários</button>
      </form>
    </div>
    {selectedDay === day && selectedPerson === professional && ready && <div className="card booking-panel">
      <h2>Horários disponíveis</h2>
      <BookingContact slots={check.slots} {...contact} />
    </div>}
  </>;
}

export function BookingContact({ slots, initialName, action, requestId }: {
  slots: Slot[]; initialName: string; action: (data: FormData) => Promise<void>; requestId: string;
}) {
  const [slot, setSlot] = useState("");
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const slotValid = slots.some((entry) => entry.slot.slice(11,16) === slot);
  const nameValid = name.trim().length > 0;
  const phoneValid = /^[1-9]\d9\d{8}$/.test(phone.replace(/\D/g, ""));
  const message = !slotValid ? "Selecione um horário disponível."
    : !nameValid ? "Preencha seu nome."
    : !phoneValid ? "Preencha o WhatsApp com DDD e nove dígitos."
    : "Tudo preenchido. Você já pode confirmar seu agendamento.";
  function mask(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0,11);
    if (!digits) return "";
    if (digits.length <= 2) return "(" + digits;
    const number = digits.slice(2);
    return "(" + digits.slice(0,2) + ")" + number.slice(0,5) + (number.length > 5 ? "-" + number.slice(5) : "");
  }
  return <form className="account-form" action={action}>
    <input type="hidden" name="requestId" value={requestId} />
    <fieldset className="booking-slots"><legend>Escolha o horário</legend>
      {slots.map(({ slot: value }) => <label key={value}>
        <input name="slot" type="radio" required value={value.slice(11,16)} checked={slot === value.slice(11,16)} onChange={(event) => setSlot(event.target.value)} /> {value.slice(11,16)}
      </label>)}
    </fieldset>
    <label>Nome <input name="customer" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)}
      className={slotValid && !nameValid ? "booking-field-required" : undefined}
      aria-invalid={!!slotValid && !nameValid} aria-describedby="booking-contact-help" autoComplete="name" /></label>
    <label>WhatsApp <input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={15}
      value={phone} onChange={(event) => setPhone(mask(event.target.value))} placeholder="(99)99999-9999"
      className={slotValid && nameValid && !phoneValid ? "booking-field-required" : undefined}
      aria-invalid={!!slotValid && nameValid && !phoneValid} aria-describedby="booking-contact-help" /></label>
    <p id="booking-contact-help" role="status">{message}</p>
    <SubmitButton disabled={!slotValid || !nameValid || !phoneValid}>Confirmar agendamento</SubmitButton>
  </form>;
}

