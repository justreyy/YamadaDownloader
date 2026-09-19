export const config = { runtime: "edge" };

import { createAdminToken } from "./_lib/adminAuth.mjs";

export default async function handler(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request tidak valid." }, { status: 400 });
  }

  const inputKey = String(body?.key || "").trim();

  // Key default "reygantenganakmamah" dipakai kalau env var ADMIN_PANEL_KEY
  // belum diisi di Vercel. Buat ganti key: tambahkan/ubah ADMIN_PANEL_KEY di
  // Vercel > Settings > Environment Variables lalu redeploy — cuma yang
  // punya akses dashboard Vercel (kamu) yang bisa melakukan ini.
  const correctKey = process.env.ADMIN_PANEL_KEY || "reygantenganakmamah";

  if (!inputKey || inputKey !== correctKey) {
    // Delay kecil biar gak enak buat brute force key.
    await new Promise((resolve) => setTimeout(resolve, 700));
    return Response.json({ error: "Key salah." }, { status: 401 });
  }

  const token = await createAdminToken();

  return Response.json(
    { token, expiresIn: 12 * 60 * 60 },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
