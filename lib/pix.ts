export function normalizePixKey(raw: string) {
  const value = raw.trim();
  if (value.length > 77) return null;
  if (/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) return value.toLowerCase();
  if (/^[!-~]+$/.test(value) && /^[^@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)) return value.toLowerCase();
  const normalized = value.replace(/[()./\s-]/g, "");
  return /^(?:\d{11}|\d{14}|\+[1-9]\d{7,14})$/.test(normalized) ? normalized : null;
}
export function pixLabel(value: string, limit: number) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9 .-]/gi, " ").replace(/\s+/g, " ")
    .trim().toUpperCase().slice(0, limit).trimEnd();
}

function field(id: string, value: string) {
  return id + String(value.length).padStart(2, "0") + value;
}

export function pixTransactionId(orderId: string) {
  return orderId.replaceAll("-", "").slice(0, 25);
}

export function showcasePix(order: { id: string; pix_key: string; merchant: string; city: string; total_cents: number }) {
  const cents = String(order.total_cents).padStart(3, "0");
  const amount = cents.slice(0, -2) + "." + cents.slice(-2);
  const txid = pixTransactionId(order.id);
  const payload = field("00", "01")
    + field("26", field("00", "br.gov.bcb.pix") + field("01", order.pix_key))
    + field("52", "0000") + field("53", "986") + field("54", amount) + field("58", "BR")
    + field("59", order.merchant) + field("60", order.city) + field("62", field("05", txid)) + "6304";
  let crc = 0xffff;
  for (const char of payload) {
    crc ^= char.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
    }
  }
  return payload + crc.toString(16).toUpperCase().padStart(4, "0");
}
