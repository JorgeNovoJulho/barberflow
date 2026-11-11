import "server-only";
import { coordinatesFromMap } from "./directory-distance";

export async function resolveMapCoordinates(value: string) {
  if (value.length > 500) return null;
  try {
    let url = new URL(value);
    const signal = AbortSignal.timeout(5000);
    for (let hop = 0; hop < 4; hop++) {
      if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
      const coordinates = coordinatesFromMap(url.href);
      if (coordinates) return `${coordinates.latitude}, ${coordinates.longitude}`;
      if (!(url.hostname === "maps.app.goo.gl" || (url.hostname === "goo.gl" && url.pathname.startsWith("/maps/")))) return null;
      const response = await fetch(url, { redirect: "manual", cache: "no-store", signal });
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (![301, 302, 303, 307, 308].includes(response.status) || !location) return null;
      url = new URL(location, url);
    }
  } catch {
    return null;
  }
  return null;
}
