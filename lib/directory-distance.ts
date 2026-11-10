export type Coordinates = { latitude: number; longitude: number };

export function parseCoordinates(value: string | null | undefined): Coordinates | null {
  const pair = value?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!pair) return null;
  const latitude = Number(pair[1]);
  const longitude = Number(pair[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

export function coordinatesFromMap(value: string | null | undefined): Coordinates | null {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" || !/^(?:www\.|maps\.)?google\.(?:com|com\.br)$/.test(url.hostname)) return null;
    const path = decodeURIComponent(url.pathname);
    const pin = url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    const query = url.searchParams.get("query") ?? url.searchParams.get("q") ?? url.searchParams.get("destination");
    const center = path.match(/\/place\/[^/]+\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),/);
    return parseCoordinates(pin?.slice(1).join(",")) ?? parseCoordinates(query) ?? parseCoordinates(center?.slice(1).join(","));
  } catch {
    return null;
  }
}

export function distanceKm(from: Coordinates, to: Coordinates) {
  const radians = Math.PI / 180;
  const latitude = (to.latitude - from.latitude) * radians;
  const longitude = (to.longitude - from.longitude) * radians;
  const chord = Math.sin(latitude / 2) ** 2 + Math.cos(from.latitude * radians) *
    Math.cos(to.latitude * radians) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, chord)));
}
