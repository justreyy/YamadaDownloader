export const config = { runtime: "edge" };

import { createAdminToken, isAdminConfigured, safeEqual } from "./_lib/adminAuth.mjs";
import { isKvConfigured, kvIncr, kvCommand } from "./_lib/kv.mjs";

// Batas percobaan login per IP (hanya aktif kalau Vercel KV sudah disetup).
const MAX_ATTEMPTS = 8;
const WINDOW_SECONDS = 15 * 60;

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Tidak ada key bawaan. Wajib isi ADMIN_PANEL_KEY di Vercel > Settings >
  // Environment Variables, lalu redeploy.
  if (!isAdminConfigured()) {
    return Response.json(
      { error: "Panel admin belum aktif: isi ADMIN_PANEL_KEY di Environment Variables Vercel lalu redeploy." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request tidak valid." }, { status: 400 });
  }

  const inputKey = String(body?.key || "").trim();

  let attemptsKey = null;
  if (isKvConfigured()) {
    attemptsKey = `ratelimit:admin:${clientIp(request)}`;
    const attempts = await kvIncr(attemptsKey);
    await kvCommand(["expire", attemptsKey, String(WINDOW_SECONDS)]);
    if (attempts > MAX_ATTEMPTS) {
      return Response.json(
        { error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(WINDOW_SECONDS) } }
      );
    }
  }

  if (!inputKey || !safeEqual(inputKey, process.env.ADMIN_PANEL_KEY)) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return Response.json({ error: "Key salah." }, { status: 401 });
  }

  if (attemptsKey) await kvCommand(["del", attemptsKey]);

  const token = await createAdminToken();

  return Response.json(
    { token, expiresIn: 12 * 60 * 60 },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
