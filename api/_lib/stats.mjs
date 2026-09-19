// Statistik Dashboard Panel Admin: total download, download hari ini,
// jumlah API request, jumlah request gagal, dan status API terakhir.
// Dipanggil dari api/download.mjs & api/download-pinterest.mjs setiap kali
// ada request masuk, supaya angkanya cerminan kejadian nyata (bukan
// fire-and-forget dari frontend seperti stats:visits/stats:tools).

import { kvIncr, kvGet, kvSetJSON, kvGetJSON, isKvConfigured } from "./kv.mjs";

const TOTAL_DOWNLOADS_KEY = "stats:downloads:total";
const FAILED_REQUESTS_KEY = "stats:api:failed";
const TOTAL_REQUESTS_KEY = "stats:api:requests";
const LAST_STATUS_KEY = "stats:api:last";

// Tanggal "hari ini" dihitung pakai zona waktu Jakarta (WIB) supaya cocok
// dengan hari yang dialami pengunjung website ini.
function todayKey() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  return `stats:downloads:daily:${today}`;
}

// Dipanggil sekali tiap request benar-benar diteruskan ke API downloader
// (bukan yang ditolak duluan karena maintenance/platform OFF).
export async function trackApiRequest() {
  if (!isKvConfigured()) return;
  await kvIncr(TOTAL_REQUESTS_KEY);
}

// API downloader error/unreachable -> tandai "Status API" jadi offline.
export async function trackApiFailure(platform, message) {
  if (!isKvConfigured()) return;
  await Promise.all([
    kvIncr(FAILED_REQUESTS_KEY),
    kvSetJSON(LAST_STATUS_KEY, {
      status: "offline",
      platform: platform || "unknown",
      message: String(message || "").slice(0, 200),
      at: Date.now()
    })
  ]);
}

// API downloader merespons normal -> tandai "Status API" jadi online.
export async function trackApiSuccess(platform) {
  if (!isKvConfigured()) return;
  await kvSetJSON(LAST_STATUS_KEY, {
    status: "online",
    platform: platform || "unknown",
    at: Date.now()
  });
}

// Dipanggil hanya saat user benar-benar berhasil dapat link file final
// (request dengan download:true yang sukses), itulah definisi "download".
export async function trackDownloadCompleted() {
  if (!isKvConfigured()) return;
  await Promise.all([kvIncr(TOTAL_DOWNLOADS_KEY), kvIncr(todayKey())]);
}

export async function getDashboardStats() {
  if (!isKvConfigured()) {
    return {
      totalDownloads: 0,
      downloadsToday: 0,
      apiRequests: 0,
      apiFailed: 0,
      apiStatus: { status: "unknown", at: null }
    };
  }

  const [totalDownloads, downloadsToday, apiRequests, apiFailed, apiStatus] = await Promise.all([
    kvGet(TOTAL_DOWNLOADS_KEY),
    kvGet(todayKey()),
    kvGet(TOTAL_REQUESTS_KEY),
    kvGet(FAILED_REQUESTS_KEY),
    kvGetJSON(LAST_STATUS_KEY, { status: "unknown", at: null })
  ]);

  return {
    totalDownloads: Number(totalDownloads || 0),
    downloadsToday: Number(downloadsToday || 0),
    apiRequests: Number(apiRequests || 0),
    apiFailed: Number(apiFailed || 0),
    apiStatus
  };
}
