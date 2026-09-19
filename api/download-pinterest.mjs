export const config = { runtime: "edge" };

import { getMaintenanceSettings, isPlatformEnabled } from "./_lib/settings.mjs";
import { trackApiRequest, trackApiSuccess, trackApiFailure, trackDownloadCompleted } from "./_lib/stats.mjs";

export default async function handler(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Request JSON tidak valid." }, { status: 400 }); }

  const url = String(body?.url || "").trim();
  const shouldDownload = body?.download === true;
  const mediaIndex = Number.isInteger(body?.mediaIndex) ? body.mediaIndex : 0;

  if (!/^https?:\/\//i.test(url)) {
    return Response.json({ error: "URL Pinterest tidak valid." }, { status: 400 });
  }

  const maintenance = await getMaintenanceSettings();
  if (maintenance.enabled) {
    return Response.json(
      { error: maintenance.message, maintenance: true },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!(await isPlatformEnabled("pinterest"))) {
    return Response.json(
      { error: "Downloader Pinterest sedang dinonaktifkan oleh admin.", disabled: true },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const apiBase = process.env.PINTEREST_API_URL || "https://api.nexray.eu.cc/downloader/pinterest";

  await trackApiRequest();

  try {
    const apiUrl = `${apiBase}?url=${encodeURIComponent(url)}`;
    const upstream = await fetch(apiUrl, {
      method: "GET",
      headers: { "Accept": "application/json", "User-Agent": "YamadaDownloader/1.0" }
    });
    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      const message = data?.message || data?.error || `Nexray API error (${upstream.status})`;
      await trackApiFailure("pinterest", message);
      return Response.json({ error: message }, { status: 502 });
    }
    if (!data?.status || !data?.result) {
      await trackApiSuccess("pinterest");
      return Response.json({ error: data?.message || "API tidak menemukan media dari link tersebut." }, { status: 422 });
    }

    const result = data.result;

    // Nexray Pinterest kadang balikin single object media, kadang array.
    // Normalisasi jadi array biar seragam dengan tools lain.
    const rawMedias = Array.isArray(result.medias)
      ? result.medias
      : (result.url || result.video || result.image)
        ? [{
            url: result.video || result.url || result.image,
            type: result.video ? "video" : "image",
            extension: result.video ? "mp4" : "jpg",
            quality: result.quality || (result.video ? "HD" : "Original")
          }]
        : [];

    const medias = rawMedias.filter(item => item?.url);
    const picker = medias.map((item, index) => ({
      url: item.url,
      type: item.type === "image"
        ? "Gambar"
        : `Video ${item.quality || index + 1}`,
      extension: item.extension || (item.type === "image" ? "jpg" : "mp4"),
      quality: item.quality || "",
      width: item.width || null,
      height: item.height || null
    }));

    if (!picker.length) {
      await trackApiSuccess("pinterest");
      return Response.json({ error: "API berhasil dipanggil tetapi tidak ada media download." }, { status: 422 });
    }

    await trackApiSuccess("pinterest");

    if (shouldDownload) {
      const chosen = picker[mediaIndex];
      if (!chosen || !chosen.url) {
        return Response.json({ error: "Format yang dipilih tidak ditemukan." }, { status: 422 });
      }
      await trackDownloadCompleted();
      return Response.json({
        url: chosen.url,
        extension: chosen.extension,
        title: result.title || "Pinterest"
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({
      status: "picker",
      source: "pinterest",
      title: result.title || "Pinterest",
      thumbnail: result.thumbnail || result.image || "",
      author: result.author || "",
      duration: result.duration || 0,
      picker
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await trackApiFailure("pinterest", error.message);
    return Response.json({ error: `Tidak dapat terhubung ke Nexray API: ${error.message}` }, { status: 502 });
  }
}
