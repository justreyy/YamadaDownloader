export const config = { runtime: "edge" };

// Endpoint ini SENGAJA publik (gak pakai token admin), sama seperti
// popular-tools.mjs, karena cuma nampilin status ON/OFF + nama platform dan
// status maintenance yang memang harus dibaca semua pengunjung sebelum
// pakai downloader. Untuk UBAH pengaturan, pakai /api/admin-settings yang
// butuh login Panel Admin.

import { getPlatformSettings, getMaintenanceSettings, getSiteSettings } from "./_lib/settings.mjs";

export default async function handler(request) {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const [platforms, maintenance, site] = await Promise.all([
    getPlatformSettings(),
    getMaintenanceSettings(),
    getSiteSettings()
  ]);

  return Response.json(
    { platforms, maintenance, site },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
