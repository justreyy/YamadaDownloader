# YamadaDownloader

Template website downloader dengan desain putih + biru muda, splash/loading, banner, credits, notifikasi WhatsApp 5 detik, bottom navigation, PWA/install app, dan Vercel Functions (folder `api/`).

## Struktur

- `index.html` — tampilan utama
- `style.css` — desain
- `app.js` — navigasi, UI downloader, PWA
- `api/` — Vercel Functions (download, proxy file, panel admin, statistik, remove.bg)
- `tools-features.js` / `tools-video.js` — tools yang jalan di browser (kompres, resize, QR, PDF, video)
- `ffmpeg-worker.js` — worker pendamping untuk ffmpeg.wasm (jangan dihapus)
- `banner.mp4`, `LOGO.jpg`, `*.jpg` — banner, logo, dan ikon platform
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — ikon PWA
- `manifest.webmanifest` + `sw.js` — supaya bisa di-install sebagai PWA
- `.env.example` — daftar Environment Variables yang dibutuhkan

## Jalankan di VS Code

1. Install Node.js LTS.
2. Buka folder ini di VS Code.
3. Untuk preview cepat, pakai Live Server atau jalankan server lokal.
4. Untuk mengetes folder `api/` secara lokal, install Vercel CLI (`npm i -g vercel`) lalu jalankan `vercel dev`.

## Konfigurasi yang perlu kamu ubah

Buka `app.js` dan ubah `CONFIG.whatsappChannel`.

Nomor Customer Service default ada di DUA tempat yang harus sama:
`DEFAULT_SITE_SETTINGS.csLink` di `app.js` dan `DEFAULT_SITE.csLink` di `api/_lib/settings.mjs`.
Setelah itu nomor bisa diubah dari Panel Admin > Website Setting.

Untuk banner/logo, ganti file `banner.mp4` dan `LOGO.jpg` (atau isi URL logo di Panel Admin).

## Downloader API

Frontend tidak bisa mengubah link TikTok/Instagram/YouTube menjadi file hanya dengan HTML/CSS/JS. Proyek ini memakai Vercel Functions (`api/download.mjs`) sebagai server-side proxy ke API downloader (bawaan: Nexray).

Environment Variables (lengkapnya di `.env.example`):

- `DOWNLOADER_API_URL` / `PINTEREST_API_URL` — opsional, untuk ganti API downloader.
- `ADMIN_PANEL_KEY` — WAJIB untuk Panel Admin.
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — WAJIB agar pengaturan & statistik tersimpan.
- `REMOVE_BG_API_KEY` — WAJIB untuk fitur Remove Background.

Jangan menaruh API key rahasia di JavaScript frontend maupun di kode `api/`; selalu lewat Environment Variables.

Catatan: gunakan hanya konten yang memang boleh kamu unduh dan ikuti Terms of Service platform terkait.

## Panel Admin

Buka menu **Panel** di navigasi bawah, masukkan `ADMIN_PANEL_KEY` (env
variable di Vercel). Tidak ada key bawaan: kalau belum diisi, panel admin nonaktif.
Percobaan login dibatasi 8x per 15 menit per IP (butuh Vercel KV).

Fitur yang tersedia (urut dari atas ke bawah di Panel Admin):

- **Website Setting** — ubah nama situs, deskripsi/tagline, URL logo, dan
  link Customer Service. Begitu disimpan, langsung diterapkan ke seluruh
  bagian website (judul tab browser, meta description, favicon, logo di
  topbar/status card/splash screen, dan tombol "Buka Customer Service").
- **Tools Paling Populer** — ranking pemakaian tools berdasarkan data
  pengunjung asli (bukan angka statis).
- **Maintenance Mode** — matikan sementara seluruh fitur download dengan
  pesan kustom. Pengunjung akan melihat layar overlay dengan tombol
  "Coba Lagi". Panel Admin sendiri tetap bisa diakses lewat tombol
  "Saya admin, buka Panel Login" di overlay tersebut, supaya admin tetap
  bisa login dan mematikan mode maintenance.
- **Downloader Manager** — nyalakan/matikan TikTok, Instagram, YouTube,
  Pinterest satu-satu, dan ubah nama tampilannya. Platform yang dimatikan
  otomatis ditolak juga di server (`api/download.mjs` /
  `api/download-pinterest.mjs`), bukan cuma disembunyikan di tampilan.
- **Dashboard** — Total Pengunjung, Tools Dipakai, Total Download, Download
  Hari Ini, jumlah API Request, Request Gagal, dan Status API (online/offline
  berdasarkan hasil panggilan terakhir ke API downloader).

Semua pengaturan ini disimpan di Vercel KV (lihat `.env.example`). Kalau KV
belum disetup, semua kartu di atas tetap tampil tapi perubahan tidak akan
tersimpan permanen.

## Deploy ke Vercel

1. Login ke Vercel > Add New Project > import repository Git (atau upload folder).
2. Framework Preset: **Other**. Build command & output directory dikosongkan (situs statis + folder `api/`).
3. Storage > Create Database > KV (Upstash), hubungkan ke project.
4. Isi Environment Variables sesuai `.env.example`.
5. Deploy ulang setiap kali Environment Variables diubah.

## Install sebagai aplikasi

Karena sudah PWA, browser yang mendukung akan menampilkan tombol `Install App` atau opsi "Install YamadaDownloader". Ini membuat versi aplikasi yang terasa seperti app tanpa perlu Play Store.

Kalau target akhirnya APK Android, project ini bisa dibungkus lagi menggunakan Capacitor setelah website sudah stabil.

## Penting

API downloader adalah layanan terpisah dari hosting frontend. Vercel cocok untuk website dan Functions, tetapi mesin downloader yang memproses media sebaiknya dijalankan di server/container yang memang mendukung proses tersebut.
