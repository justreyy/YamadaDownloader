// Klien kecil untuk Vercel KV (Upstash Redis REST API).
// Dipakai bersama oleh semua endpoint yang butuh baca/tulis statistik &
// pengaturan, supaya logika request ke KV nggak duplikat di banyak file.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export function isKvConfigured() {
  return Boolean(KV_URL && KV_TOKEN);
}

export async function kvCommand(pathSegments) {
  if (!isKvConfigured()) return null;
  try {
    const url = `${KV_URL}/${pathSegments.map(encodeURIComponent).join("/")}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function kvGet(key) {
  const result = await kvCommand(["get", key]);
  return result?.result ?? null;
}

export async function kvGetJSON(key, fallback = null) {
  const raw = await kvGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function kvSet(key, value) {
  return kvCommand(["set", key, value]);
}

export async function kvSetJSON(key, value) {
  return kvSet(key, JSON.stringify(value));
}

export async function kvIncr(key) {
  const result = await kvCommand(["incr", key]);
  return Number(result?.result || 0);
}

// Upstash REST API balikin HGETALL sebagai array flat:
// [field1, value1, field2, value2, ...]
export async function kvHGetAll(key) {
  const result = await kvCommand(["hgetall", key]);
  const raw = Array.isArray(result?.result) ? result.result : [];
  const obj = {};
  for (let i = 0; i < raw.length; i += 2) obj[raw[i]] = raw[i + 1];
  return obj;
}

export async function kvHSet(key, field, value) {
  return kvCommand(["hset", key, field, value]);
}

export async function kvHIncrBy(key, field, amount = 1) {
  const result = await kvCommand(["hincrby", key, field, String(amount)]);
  return Number(result?.result || 0);
}
