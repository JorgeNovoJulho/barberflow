export const orderPeriods = [
  { id: "1", label: "Hoje" }, { id: "7", label: "7 dias" }, { id: "30", label: "30 dias" }, { id: "todas", label: "Todas" },
] as const;

export function orderPeriod(value: unknown) {
  return orderPeriods.find(({ id }) => id === value)?.id ?? "todas";
}

export function orderPage(value: unknown) {
  return typeof value === "string" && /^\d{1,7}$/.test(value) && Number(value) >= 1 && Number(value) <= 1000000 ? Number(value) : 1;
}

export const closedAtLabel = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
