export const businessDays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export const profileFields = [
  { key: "address", label: "Endereço (rua e número)", max: 180 },
  { key: "number", label: "Número", max: 20 },
  { key: "complement", label: "Complemento", max: 100 },
  { key: "neighborhood", label: "Bairro", max: 100 },
  { key: "region", label: "UF", max: 2 },
  { key: "postalCode", label: "CEP", max: 9 },
  { key: "map", label: "Link do Google Maps", max: 500 },
  { key: "whatsapp", label: "WhatsApp com DDD", max: 20 },
  { key: "instagram", label: "Usuário do Instagram", max: 31 },
  { key: "facebook", label: "Link do Facebook", max: 500 },
  { key: "tiktok", label: "Link do TikTok", max: 500 },
  { key: "youtube", label: "Link do YouTube", max: 500 },
  { key: "logo", label: "URL do logotipo", max: 500 },
  { key: "cover", label: "URL da capa", max: 500 },
  { key: "video", label: "URL do vídeo (MP4 ou WebM)", max: 500 },
  { key: "color", label: "Cor da página pública (hexadecimal)", max: 7 },
] as const;

export type OpeningDay = { start: string; end: string; breakStart: string; breakEnd: string };
export type BusinessProfile = Partial<Record<(typeof profileFields)[number]["key"], string>> & {
  gallery?: string[];
  hours?: Record<string, OpeningDay>;
};

export function readBusinessProfile(value: unknown): BusinessProfile {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const result: BusinessProfile = { hours: {} };
  for (const { key } of profileFields) {
    const entry = record[key];
    if (typeof entry === "string") result[key] = entry;
  }
  if (Array.isArray(record.gallery)) result.gallery = record.gallery.filter((entry): entry is string => typeof entry === "string").slice(0, 8);
  if (record.hours && typeof record.hours === "object") {
    const hours = record.hours as Record<string, unknown>;
    for (const [day] of businessDays.entries()) {
      const value = hours[day];
      if (!value || typeof value !== "object") continue;
      const { start, end, breakStart, breakEnd } = value as Record<string, unknown>;
      if (typeof start === "string" && typeof end === "string" && typeof breakStart === "string" && typeof breakEnd === "string") {
        result.hours![day] = { start, end, breakStart, breakEnd };
      }
    }
  }
  return result;
}

export function httpsUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export const publicProfileColors = [
  { name: "Violeta", value: "#6537A6" }, { name: "Azul royal", value: "#2450A8" },
  { name: "Azul-marinho", value: "#192B54" }, { name: "Grafite", value: "#262C3C" },
  { name: "Verde esmeralda", value: "#117A72" }, { name: "Verde floresta", value: "#285B38" },
  { name: "Terracota", value: "#93442B" }, { name: "Rosa orquídea", value: "#A33462" },
  { name: "Vinho", value: "#8E293F" }, { name: "Dourado", value: "#85601C" },
] as const;

export function publicProfileColor(value?: string) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : publicProfileColors[0].value;
}

export function whatsappUrl(value: string | undefined, message?: string) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!/^(55)?\d{10,11}$/.test(digits)) return undefined;
  const phone = digits.length <= 11 ? "55" + digits : digits;
  return `https://wa.me/${phone}${message ? "?" + new URLSearchParams({ text: message }) : ""}`;
}

export function socialUrl(value: string | undefined, hosts: string[]) {
  const link = httpsUrl(value);
  if (!link) return undefined;
  const { hostname } = new URL(link);
  return hosts.some((host) => hostname === host || hostname.endsWith("." + host)) ? link : undefined;
}

export function profileFromForm(form: FormData): BusinessProfile | null {
  const read = (field: string) => String(form.get(field) ?? "").trim();
  const profile: BusinessProfile = {};
  for (const { key, max } of profileFields) {
    const value = read(key);
    if (value.length > max) return null;
    profile[key] = value;
  }
  if (profile.region && !/^[A-Za-z]{2}$/.test(profile.region)) return null;
  if (profile.postalCode && !/^\d{5}-?\d{3}$/.test(profile.postalCode)) return null;
  if (profile.whatsapp && !/^(55)?\d{10,11}$/.test(profile.whatsapp.replace(/[+()\s-]/g, ""))) return null;
  if (profile.instagram && !/^@?[\w.]{1,30}$/.test(profile.instagram)) return null;
  if (profile.color && !/^#[0-9a-f]{6}$/i.test(profile.color)) return null;
  if ([profile.map, profile.logo, profile.cover, profile.video].some((value) => value && !httpsUrl(value))) return null;
  if ((profile.facebook && !socialUrl(profile.facebook, ["facebook.com", "fb.com"]))
    || (profile.tiktok && !socialUrl(profile.tiktok, ["tiktok.com"]))
    || (profile.youtube && !socialUrl(profile.youtube, ["youtube.com", "youtu.be"]))) return null;
  profile.gallery = read("gallery").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (profile.gallery.length > 8 || profile.gallery.some((value) => value.length > 500 || !httpsUrl(value))) return null;
  profile.region = profile.region?.toUpperCase();
  profile.hours = {};
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  for (const [day] of businessDays.entries()) {
    if (form.get(`open-${day}`) !== "on") continue;
    const start = read(`start-${day}`);
    const end = read(`end-${day}`);
    const breakStart = read(`break-start-${day}`);
    const breakEnd = read(`break-end-${day}`);
    if (!clock.test(start) || !clock.test(end) || start >= end) return null;
    if ((breakStart || breakEnd) && (!clock.test(breakStart) || !clock.test(breakEnd)
      || breakStart <= start || breakEnd <= breakStart || breakEnd >= end)) return null;
    profile.hours[day] = { start, end, breakStart, breakEnd };
  }
  return profile;
}
