export function localPath(value: unknown, fallback = "/configuracoes") {
  if (typeof value !== "string" || !value.startsWith("/") || /^\/[\/\\]/.test(value) || /[\\\x00-\x20]/.test(value)) return fallback;
  return value;
}

export function authOrigin() {
  return new URL(process.env.BARBERFLOW_ORIGIN ?? "http://localhost:3000").origin;
}

export function localTestSignup() {
  if (process.env.BARBERFLOW_LOCAL_TEST_SIGNUP !== "true") return false;
  const origin = new URL(authOrigin());
  return origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
}

export function policyLinks() {
  const terms = process.env.BARBERFLOW_TERMS_URL;
  const privacy = process.env.BARBERFLOW_PRIVACY_URL;
  if (!terms || !privacy) return null;
  try {
    const urls = [new URL(terms, authOrigin()), new URL(privacy, authOrigin())];
    if (urls.some((url) => !["http:", "https:"].includes(url.protocol))) return null;
    return { terms: urls[0].href, privacy: urls[1].href };
  } catch {
    return null;
  }
}
