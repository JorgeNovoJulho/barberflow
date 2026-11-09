export const sections = {
  hero: "Abertura",
  segmentos: "Segmentos",
  funcionalidades: "Funcionalidades",
  estoque: "Estoque e comanda",
  duvidas: "Perguntas frequentes",
} as const;

export type Section = keyof typeof sections;

export type LandingBlock = {
  id: string;
  section: Section;
  title: string;
  body: string;
  image_url: string;
  image_alt: string;
  position: number;
  published: boolean;
};

export function isSection(value: string): value is Section {
  return Object.hasOwn(sections, value);
}

export function validImageUrl(value: string) {
  if (!value || /^\/media\/[a-z0-9][a-z0-9._-]*$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
