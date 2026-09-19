export const config = { runtime: "edge" };

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
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const event = body?.event;

  // Tracking gak boleh sampai bikin fitur utama (download) gagal, jadi
  // semua kegagalan di sini didiamkan saja.
  try {
    if (event === "visit") {
      await kvCommand(["incr", "stats:visits"]);
    } else if (event === "tool" && body?.tool) {
      const tool = String(body.tool).replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
      if (tool) await kvCommand(["hincrby", "stats:tools", tool, "1"]);
    }
  } catch {
    // no-op
  }

  return Response.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}

