export const config = { runtime: "edge" };

// Proxy streaming download.
//
// Kenapa endpoint ini dibutuhkan:
// <a href> langsung ke URL CDN (cross-origin) membuat browser mengabaikan
// atribut `download`. Endpoint ini mengambil file di server lalu mengirim
// ulang dengan Content-Disposition: attachment, jadi file LANGSUNG terunduh.
//
// Pengamanan (sebelumnya endpoint ini bisa dipakai siapa saja untuk
// mem-proxy URL apa pun):
//  1. Hanya menerima request dari website ini sendiri (bukan hotlink situs lain).
//  2. Menolak host internal/private (localhost, 10.x, 192.168.x, 169.254.x, IPv6, dst).
//  3. Hanya port standar, dan ukuran file dibatasi.

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

function isPrivateHost(hostname) {
  const h = hostname.toLowerCase();

  if (!h.includes(".")) return true; // "localhost", nama internal tanpa titik
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.startsWith("[") || h.includes(":")) return true; // literal IPv6

  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  return false;
}

function isSafeUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.username || u.password) return false;
    if (u.port && u.port !== "80" && u.port !== "443") return false;
    return !isPrivateHost(u.hostname);
  } catch {
    return false;
  }
}

// Browser modern mengirim Sec-Fetch-Site; kalau tidak ada (Safari lama),
// cadangannya cek Origin/Referer.
function isFromThisSite(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";

  const ref = request.headers.get("origin") || request.headers.get("referer");
  if (!ref) return true;
  try {
    return new URL(ref).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

// Rapikan nama file tanpa memotong ekstensinya (dulu .slice(0,200) bisa
// memotong ".mp4" kalau judul video panjang).
function buildFilename(name) {
  const clean = String(name || "")
    .replace(/[\r\n"\\/:*?<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const dot = clean.lastIndexOf(".");
  const hasExt = dot > 0 && clean.length - dot <= 6;
  const ext = hasExt ? clean.slice(dot) : "";
  const base = (hasExt ? clean.slice(0, dot) : clean).slice(0, 120 - ext.length).trim();

  return (base || "YamadaDownloader") + (ext || ".mp4");
}

function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/[%"\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export default async function handler(request) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!isFromThisSite(request)) {
    return new Response("Akses ditolak.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const src = searchParams.get("url");

  if (!src || !isSafeUrl(src)) {
    return new Response("URL tidak valid.", { status: 400 });
  }

  const filename = buildFilename(searchParams.get("filename") || "YamadaDownloader.mp4");

  try {
    const upstreamHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 YamadaDownloader",
      Accept: "*/*"
    };

    const range = request.headers.get("range");
    if (range) upstreamHeaders["Range"] = range;

    const upstream = await fetch(src, { headers: upstreamHeaders });

    if (!upstream.ok || !upstream.body) {
      return new Response(`Gagal mengambil file dari sumber (status ${upstream.status}).`, { status: 502 });
    }

    const contentLength = Number(upstream.headers.get("content-length") || 0);
    if (contentLength > MAX_BYTES) {
      return new Response("File terlalu besar.", { status: 413 });
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
    if (contentLength) headers.set("Content-Length", String(contentLength));

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);

    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Disposition", contentDisposition(filename));
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers
    });
  } catch (error) {
    return new Response(`Gagal proxy download: ${error.message}`, { status: 502 });
  }
}
