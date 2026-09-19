export const config = { runtime: "edge" };

import { verifyAdminToken } from "./_lib/adminAuth.mjs";
import { isKvConfigured, kvGet, kvHGetAll } from "./_lib/kv.mjs";
import { getDashboardStats } from "./_lib/stats.mjs";

export default async function handler(request) {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  const isValid = await verifyAdminToken(token);
  if (!isValid) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isKvConfigured()) {
    return Response.json(
      {
        kvConfigured: false,
        totalVisits: 0,
        popularTools: [],
        totalDownloads: 0,
        downloadsToday: 0,
        apiRequests: 0,
        apiFailed: 0,
        apiStatus: { status: "unknown", at: null },
        notice:
          "Vercel KV belum disetup, jadi statistik pengunjung belum tersimpan. Tambahkan KV database dari dashboard Vercel (Storage > Create Database > KV)."
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  const [totalVisitsRaw, toolsRaw, dashboardStats] = await Promise.all([
    kvGet("stats:visits"),
    kvHGetAll("stats:tools"),
    getDashboardStats()
  ]);

  const totalVisits = Number(totalVisitsRaw || 0);

  const popularTools = Object.entries(toolsRaw)
    .map(([tool, count]) => ({ tool, count: Number(count || 0) }))
    .sort((a, b) => b.count - a.count);

  return Response.json(
    {
      kvConfigured: true,
      totalVisits,
      popularTools,
      ...dashboardStats
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
