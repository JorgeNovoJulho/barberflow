export function serviceVideoEmbed(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
    const id = host === "youtu.be" ? parts[0] : parts[0] === "watch" ? url.searchParams.get("v")
      : ["shorts", "live", "embed"].includes(parts[0]) ? parts[1] : null;
    if (id && /^[\w-]{11}$/.test(id)) return { provider: "YouTube", src: `https://www.youtube.com/embed/${id}`, href: `https://www.youtube.com/watch?v=${id}` };
  }
  if (host === "tiktok.com" && /^@[\w.-]+$/.test(parts[0] ?? "") && parts[1] === "video" && /^\d{10,24}$/.test(parts[2] ?? "")) {
    return { provider: "TikTok", src: `https://www.tiktok.com/player/v1/${parts[2]}`, href: `https://www.tiktok.com/${parts[0]}/video/${parts[2]}` };
  }
  if (host === "instagram.com" && ["p", "reel", "reels", "tv"].includes(parts[0]) && /^[\w-]{1,32}$/.test(parts[1] ?? "")) {
    const kind = parts[0] === "reels" ? "reel" : parts[0];
    const href = `https://www.instagram.com/${kind}/${parts[1]}/`;
    return { provider: "Instagram", src: href + "embed/", href };
  }
  return null;
}

export function formatServiceDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} ${hours === 1 ? "hora" : "horas"}${rest ? ` e ${rest} min` : ""}` : `${minutes} min`;
}
