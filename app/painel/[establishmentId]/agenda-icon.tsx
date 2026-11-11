export const agendaIcons = {
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6m-6 4h6",
  calendar: "M4 6h16v14H4z M8 3v6m8-6v6M4 11h16m-11 5h6",
  check: "m5 12 4 4L19 6",
  absent: "M12 8v5m0 3h.01M12 3l10 18H2z",
  cancel: "M6 6l12 12M18 6 6 18",
  unlock: "M6 11h12v10H6z M9 11V7a3 3 0 0 1 6 0",
  person: "M16 11a4 4 0 1 0-8 0m-3 9v-2a7 7 0 0 1 14 0v2",
};

export function AgendaIcon({ name }: { name: keyof typeof agendaIcons }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={agendaIcons[name]} /></svg>;
}
