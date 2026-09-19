export const config = { runtime: "edge" };

import { verifyAdminToken } from "./_lib/adminAuth.mjs";
import { isKvConfigured } from "./_lib/kv.mjs";
import {
  DEFAULT_PLATFORMS,
  getPlatformSettings,
  savePlatformSettings,
  getMaintenanceSettings,
  saveMaintenanceSettings,
  getSiteSettings,
  saveSiteSettings
} from "./_lib/settings.mjs";

async function isAuthorized(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return verifyAdminToken(token);
}

async function loadAllSettings() {
  const [platforms, maintenance, site] = await Promise.all([
    getPlatformSettings(),
    getMaintenanceSettings(),
    getSiteSettings()
  ]);
  return { platforms, maintenance, site };
}

export default async function handler(request) {
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!(await isAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "GET") {
    const settings = await loadAllSettings();
    return Response.json(
      { kvConfigured: isKvConfigured(), ...settings },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  // POST -> update pengaturan (bisa kirim platforms/maintenance/site secara
  // terpisah atau sekaligus, tergantung kartu mana yang di-Save di UI).
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request JSON tidak valid." }, { status: 400 });
  }

  if (!isKvConfigured()) {
    return Response.json(
      {
        error:
          "Vercel KV belum disetup, pengaturan tidak bisa disimpan. Tambahkan KV database dari dashboard Vercel (Storage > Create Database > KV)."
      },
      { status: 400 }
    );
  }

  if (body?.platforms && typeof body.platforms === "object") {
    const cleanUpdates = {};
    for (const id of Object.keys(DEFAULT_PLATFORMS)) {
      if (body.platforms[id] && typeof body.platforms[id] === "object") {
        cleanUpdates[id] = body.platforms[id];
      }
    }
    await savePlatformSettings(cleanUpdates);
  }

  if (body?.maintenance && typeof body.maintenance === "object") {
    await saveMaintenanceSettings(body.maintenance);
  }

  if (body?.site && typeof body.site === "object") {
    await saveSiteSettings(body.site);
  }

  const settings = await loadAllSettings();
  return Response.json(
    { ok: true, ...settings },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
