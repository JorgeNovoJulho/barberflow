export const themes = [
  { id: "esmeralda", label: "Esmeralda", color: "#a3f2bf" },
  { id: "oceano", label: "Oceano", color: "#91d5ff" },
  { id: "indigo", label: "Índigo", color: "#adbaff" },
  { id: "ametista", label: "Ametista", color: "#d7b3ff" },
  { id: "orquidea", label: "Orquídea", color: "#ffb0e4" },
  { id: "rubi", label: "Rubi", color: "#ffa6ab" },
  { id: "cobre", label: "Cobre", color: "#ffc397" },
  { id: "ambar", label: "Âmbar", color: "#ffdc8a" },
  { id: "lima", label: "Lima", color: "#d4ed98" },
  { id: "grafite", label: "Grafite", color: "#d4dbe6" },
] as const;

export type ThemeId = (typeof themes)[number]["id"];
export const defaultTheme: ThemeId = "ametista";

export function isThemeId(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}
