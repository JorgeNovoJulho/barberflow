export const segments = {
  cabelo: "Cabeleireiros",
  barbearia: "Barbearias",
  esmalteria: "Esmalterias",
  estetica: "Estética",
  manicure: "Manicure e pedicure",
  trancas: "Trancistas",
  massoterapia: "Massoterapia",
  "tatuagem-piercing": "Tatuagem e piercing",
  bronzeamento: "Bronzeamento",
  outro: "Outro segmento",
} as const;

export function isSegment(value: string): value is keyof typeof segments {
  return Object.hasOwn(segments, value);
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function parsePrice(value: string) {
  const match = /^(\d{1,6})(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
