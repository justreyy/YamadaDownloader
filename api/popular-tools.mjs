export const config = { runtime: "edge" };

// Endpoint ini SENGAJA publik (gak pakai token admin) karena cuma
// nampilin angka pemakaian tools buat kartu "Tools Populer" di beranda —
// bukan data sensitif. Statistik detail/lengkap tetap di /api/admin-stats
// yang butuh login Panel Admin.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvCommand(pathSegments) {
  if (!KV_URL || !KV_TOKEN) return null;
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

export default async function handler(request) {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!KV_URL || !KV_TOKEN) {
    return Response.json(
      { popularTools: [] },
      // Cache singkat di CDN biar gak nge-hit KV tiap kali beranda dibuka.
      { status: 200, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } }
    );
  }

  const toolsResult = await kvCommand(["hgetall", "stats:tools"]);
  const rawTools = Array.isArray(toolsResult?.result) ? toolsResult.result : [];

  const popularTools = [];
  for (let i = 0; i < rawTools.length; i += 2) {
    popularTools.push({ tool: rawTools[i], count: Number(rawTools[i + 1] || 0) });
  }
  popularTools.sort((a, b) => b.count - a.count);

  return Response.json(
    { popularTools },
    { status: 200, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } }
  );
}
