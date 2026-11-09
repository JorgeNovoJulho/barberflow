"use client";

import { useState } from "react";

export type Offering = { id: string; name: string; duration_minutes: number };
export type Provider = { id: string; name: string; services: Offering[] };

export function AppointmentFields({ providers, initialProfessional = "", initialService = "" }: {
  providers: Provider[]; initialProfessional?: string; initialService?: string;
}) {
  const [professional, setProfessional] = useState(initialProfessional);
  const chosen = providers.find(({ id }) => id === professional);
  return <div className="form-columns">
    <label>Profissional <select name="professional" required value={professional} onChange={(event) => setProfessional(event.target.value)}>
      <option value="" disabled>Selecione</option>
      {providers.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    <label>Serviço <select key={professional} name="service" defaultValue={professional === initialProfessional ? initialService : ""} required disabled={!chosen}>
      <option value="" disabled>Selecione</option>
      {chosen?.services.map(({ id, name, duration_minutes }) => <option key={id} value={id}>{name} · {duration_minutes} min</option>)}
    </select></label>
  </div>;
}
