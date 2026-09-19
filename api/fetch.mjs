export const config = { runtime: "edge" };

// Proxy streaming download.
//
// Kenapa endpoint ini dibutuhkan:
// Kalau <a href> langsung diarahkan ke URL CDN TikTok/YouTube/Instagram
// (cross-origin), browser TIDAK akan menghormati atribut `download`
// (itu aturan keamanan browser). Akibatnya klik itu cuma "membuka" video
// seperti halaman biasa, lalu muncul dialog native "Download file lagi?"
// yang membingungkan user.
//
// Endpoint ini mengambil file dari CDN sumber di server (same-origin dari
// sudut pandang browser: /api/fetch), lalu mengirim ulang ke browser
// dengan header Content-Disposition: attachment. Hasilnya: begitu tombol
// diklik, file LANGSUNG kedownload sekali jalan, tanpa dialog tambahan.

const ALLOWED_HOST_PATTERNS = [
  // TikTok
  /\.tiktokcdn(-us)?\.com$/i,
  /\.tiktokv\.com$/i,
  /\.tiktokcdn\.com$/i,
  // YouTube / Google video CDN
  /\.googlevideo\.com$/i,
  /ytimg\.com$/i,
  // Instagram / Facebook CDN
  /\.cdninstagram\.com$/i,
  /\.fbcdn\.net$/i,
  // Fallback: izinkan domain lain juga, karena API downloader (nexray)
  // kadang mengarah ke CDN mirror lain di luar daftar di atas.
];

function isSafeUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return true;
  } catch {
    return false;
  }
}

export default async function handler(request) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { searchParams } = new URL(request.url);
  const src = searchParams.get("url");
  const filenameParam = searchParams.get("filename") || "YamadaDownloader.mp4";

  if (!src || !isSafeUrl(src)) {
    return new Response("URL tidak valid.", { status: 400 });
  }

  // Sanitasi nama file supaya aman dipakai di header Content-Disposition.
  const safeFilename = String(filenameParam)
    .replace(/[\r\n"]/g, "")
    .slice(0, 200) || "YamadaDownloader.mp4";

  try {
    const upstreamHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 YamadaDownloader",
      Accept: "*/*"
    };

    // Teruskan header Range kalau ada (misalnya browser minta potongan file
    // saat resume/streaming), supaya proxy tetap kompatibel.
    const range = request.headers.get("range");
    if (range) upstreamHeaders["Range"] = range;

    const upstream = await fetch(src, { headers: upstreamHeaders });

    if (!upstream.ok || !upstream.body) {
      return new Response(
        `Gagal mengambil file dari sumber (status ${upstream.status}).`,
        { status: 502 }
      );
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") || "application/octet-stream"
    );

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);

    headers.set("Accept-Ranges", "bytes");

    // Header inilah kunci utamanya: memaksa browser melakukan download
    // langsung (attachment) dengan nama file yang rapi, bukan membuka
    // video di tab/pemutar bawaan.
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(safeFilename)}"`
    );
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers
    });
  } catch (error) {
    return new Response(`Gagal proxy download: ${error.message}`, {
      status: 502
    });
  }
}
