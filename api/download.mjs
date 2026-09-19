export const config = { runtime: "edge" };

import { getMaintenanceSettings, isPlatformEnabled, DEFAULT_PLATFORMS } from "./_lib/settings.mjs";
import { trackApiRequest, trackApiSuccess, trackApiFailure, trackDownloadCompleted } from "./_lib/stats.mjs";

// Tebak platform dari URL sebagai jaga-jaga kalau body.platform gak dikirim
// frontend (mis. dipanggil langsung lewat API tanpa lewat UI).
function detectPlatformFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("tiktok.com")) return "tiktok";
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
    if (host.includes("pinterest.")) return "pinterest";
  } catch {
    // no-op
  }
  return null;
}

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
    return Response.json({ error: "URL video tidak valid." }, { status: 400 });
  }

  // Mode maintenance -> tolak semua request duluan, jangan sampai kehitung
  // sebagai API request/gagal di statistik karena memang belum diproses.
  const maintenance = await getMaintenanceSettings();
  if (maintenance.enabled) {
    return Response.json(
      { error: maintenance.message, maintenance: true },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const platform =
    (typeof body?.platform === "string" && DEFAULT_PLATFORMS[body.platform] ? body.platform : null) ||
    detectPlatformFromUrl(url);

  if (platform && !(await isPlatformEnabled(platform))) {
    return Response.json(
      { error: `Downloader ${platform} sedang dinonaktifkan oleh admin.`, disabled: true },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const apiBase = process.env.DOWNLOADER_API_URL || "https://api.nexray.eu.cc/downloader/aio";

  // Dari sini request beneran diteruskan ke API downloader -> baru dihitung.
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
      await trackApiFailure(platform, message);
      return Response.json({ error: message }, { status: 502 });
    }
    if (!data?.status || !data?.result) {
      // Bukan API-nya down, cuma link-nya gak ketemu medianya -> tetap "online".
      await trackApiSuccess(platform);
      return Response.json({ error: data?.message || "API tidak menemukan media dari link tersebut." }, { status: 422 });
    }

    const result = data.result;
    const rawMedias = Array.isArray(result.medias) ? result.medias : [];
    const medias = rawMedias.filter(item => item?.url);
    const picker = medias.map((item, index) => ({
      url: item.url,
      type: item.type === "audio" ? "Audio" : `Video ${item.quality || index + 1}`,
      extension: item.extension || (item.type === "audio" ? "mp3" : "mp4"),
      quality: item.quality || "",
      width: item.width || null,
      height: item.height || null
    }));

    if (!picker.length) {
      await trackApiSuccess(platform);
      return Response.json({ error: "API berhasil dipanggil tetapi tidak ada media download." }, { status: 422 });
    }

    await trackApiSuccess(platform);

    if (shouldDownload) {
      const chosen = picker[mediaIndex];
      if (!chosen || !chosen.url) {
        return Response.json({ error: "Format yang dipilih tidak ditemukan." }, { status: 422 });
      }
      // Ini titik dimana user beneran dapat link file final -> hitung "download".
      await trackDownloadCompleted();
      return Response.json({
        url: chosen.url,
        extension: chosen.extension,
        title: result.title || "Video"
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({
      status: "picker",
      source: result.source || "unknown",
      title: result.title || "Video",
      thumbnail: result.thumbnail || "",
      author: result.author || "",
      duration: result.duration || 0,
      picker
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await trackApiFailure(platform, error.message);
    return Response.json({ error: `Tidak dapat terhubung ke Nexray API: ${error.message}` }, { status: 502 });
  }
}
