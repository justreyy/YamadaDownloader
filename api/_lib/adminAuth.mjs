// Helper bikin & verifikasi token panel admin.
// Pakai HMAC-SHA256 (Web Crypto, tersedia native di Edge Runtime) supaya
// gak butuh database buat nyimpen session — token isinya expiry yang
// ditandatangani, jadi cukup diverifikasi ulang tiap request tanpa nyimpen apapun.

const encoder = new TextEncoder();

function base64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getSecret() {
  // Prioritas: ADMIN_SESSION_SECRET kalau ada, kalau tidak fallback ke ADMIN_PANEL_KEY.
  // Ganti salah satu di Environment Variables Vercel untuk memutuskan semua sesi lama.
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PANEL_KEY ||
    "yamada-fallback-secret-ganti-di-env"
  );
}

async function getCryptoKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createAdminToken(ttlMs = 12 * 60 * 60 * 1000) {
  const payload = JSON.stringify({ exp: Date.now() + ttlMs });
  const payloadB64 = base64url(encoder.encode(payload));
  const key = await getCryptoKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${base64url(signature)}`;
}

export async function verifyAdminToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;

  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return false;

  try {
    const key = await getCryptoKey();
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlDecode(sigB64),
      encoder.encode(payloadB64)
    );
    if (!isValid) return false;

    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}
