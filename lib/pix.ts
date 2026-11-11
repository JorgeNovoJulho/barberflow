function isCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(value[i]) * (length + 1 - i);
    return (sum * 10) % 11 % 10;
  };
  return digit(9) === Number(value[9]) && digit(10) === Number(value[10]);
}

export function normalizePixKey(raw: string) {
  const value = raw.trim();
  if (value.length > 77) return null;
  if (/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) return value.toLowerCase();
  if (/^[!-~]+$/.test(value) && /^[^@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)) return value.toLowerCase();
  const localPhone = /^\(([1-9]\d)\)\s*(\d{4,5})-?(\d{4})$/.exec(value);
  if (localPhone) return "+55" + localPhone.slice(1).join("");
  const normalized = value.replace(/[()./\s-]/g, "");
  return (isCpf(normalized) || /^(?:\d{14}|\+[1-9]\d{7,14})$/.test(normalized)) ? normalized : null;
}
export function pixLabel(value: string, limit: number) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9 .-]/gi, " ").replace(/\s+/g, " ")
    .trim().toUpperCase().slice(0, limit).trimEnd();
}

function field(id: string, value: string) {
  return id + String(value.length).padStart(2, "0") + value;
}

export function pixTransactionId(orderId: string) {
  return orderId.replace(/[^a-z0-9]/gi, "").slice(0, 25) || "***";
}

export function showcasePix(order: { id: string; pix_key: string; merchant: string; city: string; total_cents: number }) {
  const key = normalizePixKey(order.pix_key);
  const merchant = pixLabel(order.merchant, 25);
  const city = pixLabel(order.city, 15);
  if (!key || !merchant || !city || !Number.isSafeInteger(order.total_cents) || order.total_cents <= 0) return null;
  const cents = String(order.total_cents).padStart(3, "0");
  const amount = cents.slice(0, -2) + "." + cents.slice(-2);
  if (amount.length > 13) return null;
  const txid = pixTransactionId(order.id);
  const payload = field("00", "01")
    + field("26", field("00", "br.gov.bcb.pix") + field("01", key))
    + field("52", "0000") + field("53", "986") + field("54", amount) + field("58", "BR")
    + field("59", merchant) + field("60", city) + field("62", field("05", txid)) + "6304";
  return payload + pixChecksum(payload);
}

export function isPixPayload(value: string): boolean {
  return value.length <= 1024 && /^000201[ -~]+6304[0-9a-f]{4}$/i.test(value)
    && pixChecksum(value.slice(0, -4)) === value.slice(-4).toUpperCase();
}

function pixChecksum(payload: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
