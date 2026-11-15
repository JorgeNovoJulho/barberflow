"use client";

import { useState } from "react";

export type WalkInClient = { id: string; name: string; active: boolean; phone: string; photo?: string };

export function WalkInCustomer({ clients, canSelect, initialId, nameField = "name", initialName, initialPhone }: {
  clients: WalkInClient[]; canSelect: boolean; initialId?: string | null;
  nameField?: string; initialName?: string; initialPhone?: string;
}) {
  const [selected, setSelected] = useState<WalkInClient | null>(() => clients.find(client => client.id === initialId && client.active && /\d/.test(client.phone)) ?? null);
  const [search, setSearch] = useState("");
  const visible = clients.filter(client => client.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <input type="hidden" name="client_id" value={selected?.id ?? ""} />
    {canSelect && <details className="walk-in-client-picker">
      <summary className="secondary finance-tab command-action" data-tone="blue">Selecionar cliente cadastrado</summary>
      <label>Buscar cliente <input value={search} onChange={event => setSearch(event.target.value)} /></label>
      <fieldset>
        <legend>Clientes da loja</legend>
        <label><input type="radio" name="customer_choice" value="" checked={!selected} onChange={() => setSelected(null)} /> Informar cliente manualmente</label>
        {visible.map(client => <label className="subscription-business" key={client.id}>
          <input type="radio" name="customer_choice" value={client.id} disabled={!client.active || !/\d/.test(client.phone)}
            checked={selected?.id === client.id} onChange={() => setSelected(client)} />
          {client.photo ? <img className="booking-client-avatar" src={client.photo} alt="" width={36} height={36} loading="lazy" />
            : <svg className="booking-client-avatar" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>}
          <span><strong>{client.name}</strong> · {client.active ? "Ativo" : "Inativo"}{client.active && !/\d/.test(client.phone) && " · Sem WhatsApp"}</span>
        </label>)}
        {!visible.length && <p>Nenhum cliente encontrado.</p>}
      </fieldset>
    </details>}
    {selected ? <p>Cliente selecionado · <strong>{selected.name}</strong></p> : <>
      <label>Nome do cliente <input name={nameField} defaultValue={initialName} required maxLength={120} /></label>
      <label>WhatsApp <input name="phone" type="tel" defaultValue={initialPhone} required maxLength={30} /></label>
    </>}
  </>;
}
