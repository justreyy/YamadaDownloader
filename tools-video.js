// ========================================================
// YAMADA TOOLS — FITUR TAMBAHAN (bagian 2/2)
// Video Compressor, Video → MP3, Video → GIF.
// Pakai ffmpeg.wasm: proses video 100% di browser pengunjung,
// file video TIDAK diupload ke server manapun. Wajar kalau
// pertama kali dipakai agak lama, karena browser perlu
// download "mesin" ffmpeg (±25MB) sekali saja (lalu di-cache).
//
// File ini type="module" supaya bisa import langsung dari CDN
// tanpa build step (lihat tag <script type="module"> di index.html).
// ========================================================

import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
import { fetchFile, toBlobURL } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js";

const FFMPEG_CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";

let ffmpegInstance = null;
let ffmpegLoadingPromise = null;

async function getFFmpeg(onProgressLabel){
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadingPromise) return ffmpegLoadingPromise;

  ffmpegLoadingPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onProgressLabel) onProgressLabel("Mengunduh mesin video (sekali saja)...");
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm")
    ]);
    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return ffmpegLoadingPromise;
}

function ytoolFormatBytes(bytes){
  if (!bytes && bytes !== 0) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function ytoolDownloadLink(url, filename, label, iconClass){
  return `
    <a href="${url}" download="${filename}" class="remove-bg-button"
       onclick="showBigNotice('Sudah Didownload silahkan cek Chrome')"
       style="display:block;text-decoration:none;text-align:center;margin-top:10px;">
      <i class="fas ${iconClass || 'fa-download'}"></i> ${label || 'Download Hasil'}
    </a>
  `;
}

function setupProgress(ffmpeg, barEl, labelEl){
  const handler = ({ progress }) => {
    const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
    if (barEl) barEl.style.width = pct + "%";
    if (labelEl) labelEl.textContent = `Memproses... ${pct}%`;
  };
  ffmpeg.on("progress", handler);
  return () => ffmpeg.off("progress", handler);
}

/* ===================== VIDEO COMPRESSOR ===================== */

let vidCompressFile = null;

function openVidCompress(){
  document.getElementById("vidCompressModal")?.classList.add("active");
  window.trackEvent?.({ event: "tool", tool: "vidcompress" });
}
function closeVidCompress(){
  document.getElementById("vidCompressModal")?.classList.remove("active");
}

document.addEventListener("change", (e) => {
  if (e.target.id !== "vidCompressFile") return;
  const file = e.target.files?.[0];
  if (!file) return;
  vidCompressFile = file;
  const preview = document.getElementById("vidCompressPreview");
  preview.style.display = "block";
  preview.innerHTML = `<video src="${URL.createObjectURL(file)}" controls></video>
    <div class="ytool-size-compare"><span class="ytool-size-chip">Asli: <b>${ytoolFormatBytes(file.size)}</b></span></div>`;
});

const VIDEO_CRF_PRESETS = { high: "20", medium: "26", low: "32" };

async function processVidCompress(){
  const button = document.getElementById("vidCompressButton");
  const status = document.getElementById("vidCompressStatus");
  const progressWrap = document.getElementById("vidCompressProgressWrap");
  const progressBar = document.getElementById("vidCompressProgressBar");
  const progressLabel = document.getElementById("vidCompressProgressLabel");

  if (!vidCompressFile){
    status.textContent = "Pilih video terlebih dahulu.";
    status.className = "remove-bg-status error";
    return;
  }

  button.disabled = true;
  progressWrap.classList.add("active");
  progressLabel.classList.add("active");
  status.textContent = "Menyiapkan...";
  status.className = "remove-bg-status";

  try{
    const crf = VIDEO_CRF_PRESETS[document.getElementById("vidCompressPreset").value] || "26";
    const ffmpeg = await getFFmpeg((msg) => { status.textContent = msg; });
    const cleanup = setupProgress(ffmpeg, progressBar, progressLabel);

    status.textContent = "Mengompres video...";
    await ffmpeg.writeFile("input.mp4", await fetchFile(vidCompressFile));
    await ffmpeg.exec([
      "-i", "input.mp4",
      "-vcodec", "libx264", "-crf", crf, "-preset", "veryfast",
      "-acodec", "aac", "-b:a", "128k",
      "output.mp4"
    ]);
    const data = await ffmpeg.readFile("output.mp4");
    cleanup();

    const blob = new Blob([data.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const saved = vidCompressFile.size > 0
      ? Math.round((1 - blob.size / vidCompressFile.size) * 100)
      : 0;

    status.textContent = "Video berhasil dikompres!";
    status.className = "remove-bg-status success";

    const preview = document.getElementById("vidCompressPreview");
    preview.innerHTML = `
      <video src="${url}" controls></video>
      <div class="ytool-size-compare">
        <span class="ytool-size-chip">Asli: <b>${ytoolFormatBytes(vidCompressFile.size)}</b></span>
        <span class="ytool-size-chip ${saved > 0 ? 'save' : ''}">Hasil: <b>${ytoolFormatBytes(blob.size)}</b> ${saved > 0 ? `(-${saved}%)` : ''}</span>
      </div>
      ${ytoolDownloadLink(url, "yamada-compress.mp4", "Download Video", "fa-file-video")}
    `;
    window.trackEvent?.({ event: "download", tool: "vidcompress" });

    await ffmpeg.deleteFile("input.mp4").catch(() => {});
    await ffmpeg.deleteFile("output.mp4").catch(() => {});
  }catch(error){
    console.error("Video Compress Error:", error);
    status.textContent = error.message || "Gagal mengompres video ini.";
    status.className = "remove-bg-status error";
  }finally{
    button.disabled = false;
    progressWrap.classList.remove("active");
  }
}

/* ===================== VIDEO → MP3 ===================== */

let vidMp3File = null;

function openVidMp3(){
  document.getElementById("vidMp3Modal")?.classList.add("active");
  window.trackEvent?.({ event: "tool", tool: "vidmp3" });
}
function closeVidMp3(){
  document.getElementById("vidMp3Modal")?.classList.remove("active");
}

document.addEventListener("change", (e) => {
  if (e.target.id !== "vidMp3File") return;
  const file = e.target.files?.[0];
  if (!file) return;
  vidMp3File = file;
  const preview = document.getElementById("vidMp3Preview");
  preview.style.display = "block";
  preview.innerHTML = `<video src="${URL.createObjectURL(file)}" controls></video>`;
});

async function processVidMp3(){
  const button = document.getElementById("vidMp3Button");
  const status = document.getElementById("vidMp3Status");
  const progressWrap = document.getElementById("vidMp3ProgressWrap");
  const progressBar = document.getElementById("vidMp3ProgressBar");
  const progressLabel = document.getElementById("vidMp3ProgressLabel");

  if (!vidMp3File){
    status.textContent = "Pilih video terlebih dahulu.";
    status.className = "remove-bg-status error";
    return;
  }

  button.disabled = true;
  progressWrap.classList.add("active");
  progressLabel.classList.add("active");
  status.textContent = "Menyiapkan...";
  status.className = "remove-bg-status";

  try{
    const bitrate = document.getElementById("vidMp3Bitrate").value || "192k";
    const ffmpeg = await getFFmpeg((msg) => { status.textContent = msg; });
    const cleanup = setupProgress(ffmpeg, progressBar, progressLabel);

    status.textContent = "Mengambil audio...";
    await ffmpeg.writeFile("input.mp4", await fetchFile(vidMp3File));
    await ffmpeg.exec([
      "-i", "input.mp4", "-vn",
      "-acodec", "libmp3lame", "-b:a", bitrate,
      "output.mp3"
    ]);
    const data = await ffmpeg.readFile("output.mp3");
    cleanup();

    const blob = new Blob([data.buffer], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    status.textContent = "Audio berhasil diambil!";
    status.className = "remove-bg-status success";

    const preview = document.getElementById("vidMp3Preview");
    preview.innerHTML = `
      <audio src="${url}" controls></audio>
      <div class="ytool-size-compare"><span class="ytool-size-chip">File: <b>${ytoolFormatBytes(blob.size)}</b></span></div>
      ${ytoolDownloadLink(url, "yamada-audio.mp3", "Download MP3", "fa-music")}
    `;
    window.trackEvent?.({ event: "download", tool: "vidmp3" });

    await ffmpeg.deleteFile("input.mp4").catch(() => {});
    await ffmpeg.deleteFile("output.mp3").catch(() => {});
  }catch(error){
    console.error("Video to MP3 Error:", error);
    status.textContent = error.message || "Gagal mengambil audio dari video ini.";
    status.className = "remove-bg-status error";
  }finally{
    button.disabled = false;
    progressWrap.classList.remove("active");
  }
}

/* ===================== VIDEO → GIF ===================== */

let vidGifFile = null;

function openVidGif(){
  document.getElementById("vidGifModal")?.classList.add("active");
  window.trackEvent?.({ event: "tool", tool: "vidgif" });
}
function closeVidGif(){
  document.getElementById("vidGifModal")?.classList.remove("active");
}

document.addEventListener("change", (e) => {
  if (e.target.id !== "vidGifFile") return;
  const file = e.target.files?.[0];
  if (!file) return;
  vidGifFile = file;
  const preview = document.getElementById("vidGifPreview");
  preview.style.display = "block";
  preview.innerHTML = `<video src="${URL.createObjectURL(file)}" controls></video>`;
});

async function processVidGif(){
  const button = document.getElementById("vidGifButton");
  const status = document.getElementById("vidGifStatus");
  const progressWrap = document.getElementById("vidGifProgressWrap");
  const progressBar = document.getElementById("vidGifProgressBar");
  const progressLabel = document.getElementById("vidGifProgressLabel");

  if (!vidGifFile){
    status.textContent = "Pilih video terlebih dahulu.";
    status.className = "remove-bg-status error";
    return;
  }

  const start = Math.max(0, Number(document.getElementById("vidGifStart").value) || 0);
  const duration = Math.min(15, Math.max(1, Number(document.getElementById("vidGifDuration").value) || 5));
  const fps = document.getElementById("vidGifFps").value || "10";
  const width = document.getElementById("vidGifWidth").value || "480";

  button.disabled = true;
  progressWrap.classList.add("active");
  progressLabel.classList.add("active");
  status.textContent = "Menyiapkan...";
  status.className = "remove-bg-status";

  try{
    const ffmpeg = await getFFmpeg((msg) => { status.textContent = msg; });
    const cleanup = setupProgress(ffmpeg, progressBar, progressLabel);

    status.textContent = "Membuat GIF...";
    await ffmpeg.writeFile("input.mp4", await fetchFile(vidGifFile));

    const filter = `fps=${fps},scale=${width}:-1:flags=lanczos`;
    await ffmpeg.exec([
      "-ss", String(start), "-t", String(duration), "-i", "input.mp4",
      "-vf", filter, "-loop", "0",
      "output.gif"
    ]);
    const data = await ffmpeg.readFile("output.gif");
    cleanup();

    const blob = new Blob([data.buffer], { type: "image/gif" });
    const url = URL.createObjectURL(blob);

    status.textContent = "GIF berhasil dibuat!";
    status.className = "remove-bg-status success";

    const preview = document.getElementById("vidGifPreview");
    preview.innerHTML = `
      <img src="${url}" alt="Hasil GIF">
      <div class="ytool-size-compare"><span class="ytool-size-chip">File: <b>${ytoolFormatBytes(blob.size)}</b></span></div>
      ${ytoolDownloadLink(url, "yamada-video.gif", "Download GIF", "fa-images")}
    `;
    window.trackEvent?.({ event: "download", tool: "vidgif" });

    await ffmpeg.deleteFile("input.mp4").catch(() => {});
    await ffmpeg.deleteFile("output.gif").catch(() => {});
  }catch(error){
    console.error("Video to GIF Error:", error);
    status.textContent = error.message || "Gagal membuat GIF dari video ini.";
    status.className = "remove-bg-status error";
  }finally{
    button.disabled = false;
    progressWrap.classList.remove("active");
  }
}

// Modul ES tidak otomatis expose function-nya ke global scope, padahal
// tombol di index.html manggil lewat onclick="..." (sama kayak pola
// openRemoveBg() yang sudah ada). Jadi di-expose manual ke window di sini.
Object.assign(window, {
  openVidCompress, closeVidCompress, processVidCompress,
  openVidMp3, closeVidMp3, processVidMp3,
  openVidGif, closeVidGif, processVidGif
});
