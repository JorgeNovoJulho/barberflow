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

export const landingDefaults = {
  brand: "TOP BARBER", logoUrl: "", kicker: "Gestão para beleza e bem-estar",
  primaryText: "Criar conta", primaryUrl: "/cadastro",
  secondaryText: "Ver planos", secondaryUrl: "/planos",
  headerText: "Entrar", headerUrl: "/login",
  segmentsTitle: "Encontre o seu segmento", featuresTitle: "Da reserva ao fechamento do dia",
  stockTitle: "Estoque e comanda", faqTitle: "Perguntas frequentes",
  discoveryTitle: "Encontre seu próximo atendimento", discoveryText: "Busque por cidade ou segmento e agende na página do estabelecimento.",
  discoveryButton: "Buscar estabelecimentos", footerText: "Gestão para beleza e bem-estar.",
  contactText: "", contactUrl: "", accent: "#d9a965", overlay: "76", photoFocus: "right",
  navSegments: "Segmentos", navFeatures: "Funcionalidades", navStock: "Estoque", navFaq: "Dúvidas",
};

export type LandingSettings = typeof landingDefaults & { discovery: boolean; motion: boolean };

export const landingFields: Record<keyof typeof landingDefaults, string> = {
  brand: "Nome da marca", logoUrl: "Endereço da imagem do logotipo", kicker: "Chamada acima do título", primaryText: "Texto do botão principal",
  primaryUrl: "Destino do botão principal", secondaryText: "Texto do botão secundário", secondaryUrl: "Destino do botão secundário",
  headerText: "Texto do botão do cabeçalho", headerUrl: "Destino do botão do cabeçalho",
  segmentsTitle: "Título de segmentos", featuresTitle: "Título de funcionalidades", stockTitle: "Título de estoque",
  faqTitle: "Título de perguntas frequentes", discoveryTitle: "Título da busca de estabelecimentos",
  discoveryText: "Descrição da busca", discoveryButton: "Texto do botão de busca", footerText: "Descrição no rodapé",
  contactText: "Texto do link de contato", contactUrl: "Destino do link de contato", accent: "Cor de destaque",
  overlay: "Intensidade do fundo sobre a foto (%)", photoFocus: "Posição da imagem de abertura",
  navSegments: "Nome de Segmentos no menu", navFeatures: "Nome de Funcionalidades no menu",
  navStock: "Nome de Estoque no menu", navFaq: "Nome de Dúvidas no menu",
};

export function validLandingLink(value: string) {
  if (/^\/(?!\/)[^\\\u0000-\u0020]*$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}

export function parseLandingSettings(raw: unknown): LandingSettings {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const result = { ...landingDefaults, discovery: record.discovery !== false, motion: record.motion !== false };
  for (const key of Object.keys(landingDefaults) as (keyof typeof landingDefaults)[]) {
    const value = record[key];
    if (typeof value !== "string" || value.length > 500) continue;
    if (key === "logoUrl" ? !validImageUrl(value) : key.endsWith("Url") && value && !validLandingLink(value)) continue;
    if (key === "accent" && !/^#[a-f\d]{6}$/i.test(value)) continue;
    if (key === "overlay" && !/^(?:[5-8]\d|9[0-5])$/.test(value)) continue;
    if (key === "photoFocus" && !["left", "center", "right"].includes(value)) continue;
    result[key] = value;
  }
  for (const key of Object.keys(landingDefaults) as (keyof typeof landingDefaults)[]) {
    if (key !== "logoUrl" && !key.endsWith("Url") && !key.endsWith("Href")) {
      result[key] = result[key].replace(/\b(?:Top BarberFlow|Barberflow)\b/gi, "TOP BARBER");
    }
  }
  return result;
}
