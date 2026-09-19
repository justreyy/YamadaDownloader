// ========================================================
// YAMADA TOOLS — FITUR TAMBAHAN (bagian 1/2)
// Semua tool di file ini murni jalan di BROWSER (canvas / lib
// ringan), gambar/PDF pengguna TIDAK pernah diupload ke server.
// Pola open/close/process-nya sengaja disamakan dengan
// openRemoveBg()/closeRemoveBg()/processRemoveBg() di app.js
// biar konsisten.
// ========================================================

function ytoolFormatBytes(bytes){
  if (!bytes && bytes !== 0) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function ytoolModal(id){ return document.getElementById(id); }

function ytoolOpen(id, trackName){
  const modal = ytoolModal(id);
  if (!modal) return;
  if (typeof trackEvent === "function" && trackName){
    trackEvent({ event: "tool", tool: trackName });
  }
  modal.classList.add("active");
}

function ytoolClose(id){
  const modal = ytoolModal(id);
  if (!modal) return;
  modal.classList.remove("active");
}

function ytoolReadImage(file){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
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

/* ===================== 1. IMAGE COMPRESSOR ===================== */

let imgCompressFile = null;

function openImgCompress(){ ytoolOpen("imgCompressModal", "imgcompress"); }
function closeImgCompress(){ ytoolClose("imgCompressModal"); }

document.addEventListener("change", (e) => {
  if (e.target.id !== "imgCompressFile") return;
  const file = e.target.files?.[0];
  if (!file) return;
  imgCompressFile = file;
  const preview = document.getElementById("imgCompressPreview");
  preview.style.display = "block";
  preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Preview">
    <div class="ytool-size-compare"><span class="ytool-size-chip">Asli: <b>${ytoolFormatBytes(file.size)}</b></span></div>`;
});

document.addEventListener("input", (e) => {
  if (e.target.id === "imgCompressQuality"){
    document.getElementById("imgCompressQualityVal").textContent = e.target.value + "%";
  }
});

async function processImgCompress(){
  const button = document.getElementById("imgCompressButton");
  const status = document.getElementById("imgCompressStatus");

  if (!imgCompressFile){
    status.textContent = "Pilih gambar terlebih dahulu.";
    status.className = "remove-bg-status error";
    return;
  }

  button.disabled = true;
  status.textContent = "Mengompres gambar...";
  status.className = "remove-bg-status";

  try{
    const quality = Number(document.getElementById("imgCompressQuality").value) / 100;
    const format = document.getElementById("imgCompressFormat").value; // image/jpeg | image/webp | image/png

    const img = await ytoolReadImage(imgCompressFile);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    // Background putih dulu supaya PNG transparan tidak jadi hitam saat dikonversi ke JPEG.
    if (format === "image/jpeg"){
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, format, quality));
    if (!blob) throw new Error("Gagal memproses gambar ini.");

    const url = URL.createObjectURL(blob);
    const ext = format === "image/png" ? "png" : (format === "image/webp" ? "webp" : "jpg");
    const saved = imgCompressFile.size > 0
      ? Math.max(0, Math.round((1 - blob.size / imgCompressFile.size) * 100))
      : 0;

    status.textContent = "Gambar berhasil dikompres!";
    status.className = "remove-bg-status success";

    const preview = document.getElementById("imgCompressPreview");
    preview.innerHTML = `
      <img src="${url}" alt="Hasil kompres">
      <div class="ytool-size-compare">
        <span class="ytool-size-chip">Asli: <b>${ytoolFormatBytes(imgCompressFile.size)}</b></span>
        <span class="ytool-size-chip save">Hasil: <b>${ytoolFormatBytes(blob.size)}</b> (-${saved}%)</span>
      </div>
      ${ytoolDownloadLink(url, `yamada-compress.${ext}`, "Download Gambar")}
    `;
  }catch(error){
    console.error("Image Compress Error:", error);
    status.textContent = error.message || "Gagal mengompres gambar.";
    status.className = "remove-bg-status error";
  }finally{
    button.disabled = false;
  }
}

/* ===================== 2. IMAGE RESIZER ===================== */

let imgResizeFile = null;
let imgResizeNatural = { w: 0, h: 0 };

function openImgResize(){ ytoolOpen("imgResizeModal", "imgresize"); }
function closeImgResize(){ ytoolClose("imgResizeModal"); }

document.addEventListener("change", async (e) => {
  if (e.target.id !== "imgResizeFile") return;
  const file = e.target.files?.[0];
  if (!file) return;
  imgResizeFile = file;
  const img = await ytoolReadImage(file);
  imgResizeNatural = { w: img.naturalWidth, h: img.naturalHeight };
  document.getElementById("imgResizeWidth").value = img.naturalWidth;
  document.getElementById("imgResizeHeight").value = img.naturalHeight;
  const preview = document.getElementById("imgResizePreview");
  preview.style.display = "block";
  preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Preview">
    <div class="ytool-size-compare"><span class="ytool-size-chip">Ukuran asli: <b>${img.naturalWidth}×${img.naturalHeight}px</b></span></div>`;
});

document.addEventListener("input", (e) => {
  if (!imgResizeNatural.w) return;
  const lock = document.getElementById("imgResizeLock");
  if (!lock || !lock.checked) return;

  if (e.target.id === "imgResizeWidth"){
    const w = Number(e.target.value) || 0;
    document.getElementById("imgResizeHeight").value =
      Math.round((w * imgResizeNatural.h) / imgResizeNatural.w) || "";
  }
  if (e.target.id === "imgResizeHeight"){
    const h = Number(e.target.value) || 0;
    document.getElementById("imgResizeWidth").value =
      Math.round((h * imgResizeNatural.w) / imgResizeNatural.h) || "";
  }
});

async function processImgResize(){
  const button = document.getElementById("imgResizeButton");
  const status = document.getElementById("imgResizeStatus");

  if (!imgResizeFile){
    status.textContent = "Pilih gambar terlebih dahulu.";
    status.className = "remove-bg-status error";
    return;
  }

  const width = Number(document.getElementById("imgResizeWidth").value);
  const height = Number(document.getElementById("imgResizeHeight").value);
  if (!width || !height || width < 1 || height < 1){
    status.textContent = "Masukkan lebar & tinggi yang valid.";
    status.className = "remove-bg-status error";
    return;
  }

  button.disabled = true;
  status.textContent = "Mengubah ukuran gambar...";
  status.className = "remove-bg-status";

  try{
    const img = await ytoolReadImage(imgResizeFile);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);

    const mime = imgResizeFile.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, 0.92));
    const url = URL.createObjectURL(blob);
    const ext = mime === "image/png" ? "png" : "jpg";

    status.textContent = "Gambar berhasil di-resize!";
    status.className = "remove-bg-status success";

    const preview = document.getElementById("imgResizePreview");
    preview.innerHTML = `
      <img src="${url}" alt="Hasil resize">
      <div class="ytool-size-compare">
        <span class="ytool-size-chip">Ukuran baru: <b>${width}×${height}px</b></span>
        <span class="ytool-size-chip">File: <b>${ytoolFormatBytes(blob.size)}</b></span>
      </div>
      ${ytoolDownloadLink(url, `yamada-resize.${ext}`, "Download Gambar")}
    `;
  }catch(error){
    console.error("Image Resize Error:", error);
    status.textContent = error.message || "Gagal mengubah ukuran gambar.";
    status.className = "remove-bg-status error";
  }finally{
    button.disabled = false;
  }
}

/* ===================== 3. THUMBNAIL DOWNLOADER ===================== */

function openThumb(){ ytoolOpen("thumbModal", "thumbnail"); }
function closeThumb(){ ytoolClose("thumbModal"); }

function ytoolExtractYoutubeId(url){
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/
  ];
  for (const re of patterns){
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

async function processThumb(){
  const button = document.getElementById("thumbButton");
  const status = document.getElementById("thumbStatus");
  const url = document.getElementById("thumbUrl").value.trim();

  const videoId = ytoolExtractYoutubeId(url);
  if (!videoId){
    status.textContent = "Link YouTube tidak valid. Tempel link video/shorts YouTube.";
    status.className = "remove-bg-status error";
    return;
  }

  button.disabled = true;
  status.textContent = "Mengambil thumbnail...";
  status.className = "remove-bg-status";

  const qualities = [
    { key: "maxresdefault", label: "Maksimal (HD)" },
    { key: "sddefault", label: "Standard" },
    { key: "hqdefault", label: "Tinggi" },
    { key: "mqdefault", label: "Sedang" },
    { key: "default", label: "Kecil" }
  ];

  try{
    const preview = document.getElementById("thumbPreview");
    preview.style.display = "block";
    preview.innerHTML = `<div class="ytool-thumb-grid">${
      qualities.map(q => {
        const src = `https://img.youtube.com/vi/${videoId}/${q.key}.jpg`;
        const dlUrl = `${CONFIG.proxyEndpoint}?url=${encodeURIComponent(src)}&filename=yamada-thumb-${q.key}.jpg`;
        return `
          <div class="ytool-thumb-card">
            <img src="${src}" alt="${q.label}" loading="lazy"
                 onerror="this.closest('.ytool-thumb-card').style.display='none'">
            <span>${q.label}</span>
            <a href="${dlUrl}" onclick="showBigNotice('Sudah Didownload silahkan cek Chrome')">
              <i class="fas fa-download"></i> Download
            </a>
          </div>
        `;
      }).join("")
    }</div>`;

    status.textContent = "Thumbnail ditemukan! Pilih kualitas yang mau didownload.";
    status.className = "remove-bg-status success";
    trackEvent({ event: "download", tool: "thumbnail" });
  }catch(error){
    console.error("Thumbnail Error:", error);
    status.textContent = "Gagal mengambil thumbnail.";
    status.className = "remove-bg-status error";
  }finally{
    button.disabled = false;
  }
}

/* ===================== 4. QR GENERATOR ===================== */

function openQr(){ ytoolOpen("qrModal", "qrgenerator"); }
function closeQr(){ ytoolClose("qrModal"); }

async function processQr(){
  const button = document.getElementById("qrButton");
  const status = document.getElementById("qrStatus");
  const text = document.getElementById("qrText").value.trim();

  if (!text){
    status.textContent = "Isi teks atau link dulu, ya.";
    status.className = "remove-bg-status error";
    return;
  }

  if (typeof QRCode === "undefined"){
    status.textContent = "Library QR gagal dimuat. Cek koneksi internet & coba lagi.";
    status.className = "remove-bg-status error";
    return;
  }

  button.disabled = true;
  status.textContent = "Membuat QR Code...";
  status.className = "remove-bg-status";

  try{
    const size = Number(document.getElementById("qrSize").value) || 300;
    const fg = document.getElementById("qrFg").value || "#000000";
    const bg = document.getElementById("qrBg").value || "#ffffff";

    const wrap = document.getElementById("qrCanvasWrap");
    wrap.style.display = "flex";
    wrap.innerHTML = "";
    const canvas = document.createElement("canvas");
    wrap.appendChild(canvas);

    await new Promise((resolve, reject) => {
      QRCode.toCanvas(canvas, text, {
        width: size,
        margin: 2,
        color: { dark: fg, light: bg }
      }, (err) => err ? reject(err) : resolve());
    });

    const url = canvas.toDataURL("image/png");
    status.textContent = "QR Code berhasil dibuat!";
    status.className = "remove-bg-status success";

    const actions = document.getElementById("qrActions");
    actions.style.display = "block";
    actions.innerHTML = ytoolDownloadLink(url, "yamada-qrcode.png", "Download QR Code", "fa-qrcode");

    trackEvent({ event: "download", tool: "qrgenerator" });
  }catch(error){
    console.error("QR Error:", error);
    status.textContent = "Gagal membuat QR Code. Teks mungkin terlalu panjang.";
    status.className = "remove-bg-status error";
  }finally{
    button.disabled = false;
  }
}

/* ===================== 5. PHOTO ENHANCER ===================== */

let enhanceFile = null;

function openEnhance(){ ytoolOpen("enhanceModal", "photoenhance"); }
function closeEnhance(){ ytoolClose("enhanceModal"); }

document.addEventListener("change", (e) => {
  if (e.target.id !== "enhanceFile") return;
  const file = e.target.files?.[0];
  if (!file) return;
  enhanceFile = file;
  const preview = document.getElementById("enhancePreview");
  preview.style.display = "block";
  preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Preview">`;
});

function ytoolSetEnhanceDefaults(){
  document.getElementById("enhanceBrightness").value = 8;
  document.getElementById("enhanceContrast").value = 14;
  document.getElementById("enhanceSaturation").value = 18;
  document.getElementById("enhanceSharpen").value = 40;
  ["Brightness","Contrast","Saturation","Sharpen"].forEach(k => {
    const el = document.getElementById("enhance" + k);
    const val = document.getElementById("enhance" + k + "Val");
    if (el && val) val.textContent = el.value + (k === "Sharpen" ? "%" : "");
  });
}

document.addEventListener("input", (e) => {
  const map = { enhanceBrightness: "enhanceBrightnessVal", enhanceContrast: "enhanceContrastVal",
                enhanceSaturation: "enhanceSaturationVal", enhanceSharpen: "enhanceSharpenVal" };
  if (map[e.target.id]){
    const suffix = e.target.id === "enhanceSharpen" ? "%" : "";
    document.getElementById(map[e.target.id]).textContent = e.target.value + suffix;
  }
});

// Unsharp mask sederhana: blur ringan lalu (original - blur) ditambahkan balik ke original.
function ytoolApplySharpen(ctx, width, height, amount){
  if (amount <= 0) return;
  const src = ctx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);
  const s = src.data, o = out.data;
  const strength = amount / 100; // 0..1
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 0; y < height; y++){
    for (let x = 0; x < width; x++){
      const i = (y * width + x) * 4;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1){
        o[i] = s[i]; o[i+1] = s[i+1]; o[i+2] = s[i+2]; o[i+3] = s[i+3];
        continue;
      }
      for (let c = 0; c < 3; c++){
        let sum = 0, k = 0;
        for (let ky = -1; ky <= 1; ky++){
          for (let kx = -1; kx <= 1; kx++){
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += s[idx] * kernel[k];
            k++;
          }
        }
        const sharpened = sum;
        o[i + c] = Math.max(0, Math.min(255, s[i + c] + (sharpened - s[i + c]) * strength));
      }
      o[i + 3] = s[i + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

async function processEnhance(){
  const button = document.getElementById("enhanceButton");
  const status = document.getElementById("enhanceStatus");

  if (!enhanceFile){
    status.textContent = "Pilih foto terlebih dahulu.";
    status.className = "remove-bg-status error";
    return;
  }

  button.disabled = true;
  status.textContent = "Meningkatkan kualitas foto...";
  status.className = "remove-bg-status";

  try{
    const brightness = 100 + Number(document.getElementById("enhanceBrightness").value); // %
    const contrast = 100 + Number(document.getElementById("enhanceContrast").value); // %
    const saturation = 100 + Number(document.getElementById("enhanceSaturation").value); // %
    const sharpen = Number(document.getElementById("enhanceSharpen").value);

    const img = await ytoolReadImage(enhanceFile);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.drawImage(img, 0, 0);
    ctx.filter = "none";

    ytoolApplySharpen(ctx, canvas.width, canvas.height, sharpen);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.95));
    const url = URL.createObjectURL(blob);

    status.textContent = "Foto berhasil ditingkatkan!";
    status.className = "remove-bg-status success";

    const preview = document.getElementById("enhancePreview");
    preview.innerHTML = `
      <div class="ytool-preview-pair">
        <div><img src="${URL.createObjectURL(enhanceFile)}" alt="Sebelum"><small>Sebelum</small></div>
        <div><img src="${url}" alt="Sesudah"><small>Sesudah</small></div>
      </div>
      ${ytoolDownloadLink(url, "yamada-enhance.jpg", "Download Foto")}
    `;

    trackEvent({ event: "download", tool: "photoenhance" });
  }catch(error){
    console.error("Photo Enhance Error:", error);
    status.textContent = error.message || "Gagal meningkatkan kualitas foto.";
    status.className = "remove-bg-status error";
  }finally{
    button.disabled = false;
  }
}

/* ===================== 6. PDF COMPRESSOR ===================== */

let pdfCompressFile = null;

function openPdfCompress(){
  ytoolOpen("pdfCompressModal", "pdfcompress");
  if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc){
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/[email protected]/build/pdf.worker.min.js";
  }
}
function closePdfCompress(){ ytoolClose("pdfCompressModal"); }

document.addEventListener("change", (e) => {
  if (e.target.id !== "pdfCompressFile") return;
  const file = e.target.files?.[0];
  if (!file) return;
  pdfCompressFile = file;
  const preview = document.getElementById("pdfCompressPreview");
  preview.style.display = "block";
  preview.innerHTML = `<div class="ytool-size-compare">
    <span class="ytool-size-chip"><i class="fas fa-file-pdf"></i> ${escapeHtml(file.name)}</span>
    <span class="ytool-size-chip">Asli: <b>${ytoolFormatBytes(file.size)}</b></span>
  </div>`;
});

const PDF_COMPRESS_LEVELS = {
  low:    { scale: 1.5, quality: 0.85, label: "Ringan" },
  medium: { scale: 1.2, quality: 0.7,  label: "Sedang" },
  high:   { scale: 0.9, quality: 0.5,  label: "Maksimal" }
};

async function processPdfCompress(){
  const button = document.getElementById("pdfCompressButton");
  const status = document.getElementById("pdfCompressStatus");
  const progressWrap = document.getElementById("pdfCompressProgressWrap");
  const progressBar = document.getElementById("pdfCompressProgressBar");
  const progressLabel = document.getElementById("pdfCompressProgressLabel");

  if (!pdfCompressFile){
    status.textContent = "Pilih file PDF terlebih dahulu.";
    status.className = "remove-bg-status error";
    return;
  }

  if (typeof pdfjsLib === "undefined" || !window.jspdf){
    status.textContent = "Library PDF gagal dimuat. Cek koneksi internet & coba lagi.";
    status.className = "remove-bg-status error";
    return;
  }

  const levelKey = document.getElementById("pdfCompressLevel").value;
  const level = PDF_COMPRESS_LEVELS[levelKey] || PDF_COMPRESS_LEVELS.medium;

  button.disabled = true;
  status.textContent = "Membaca PDF...";
  status.className = "remove-bg-status";
  progressWrap.classList.add("active");
  progressLabel.classList.add("active");
  progressBar.style.width = "0%";

  try{
    const arrayBuffer = await pdfCompressFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    const { jsPDF } = window.jspdf;
    let outputDoc = null;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++){
      progressLabel.textContent = `Memproses halaman ${pageNum} dari ${totalPages}...`;
      progressBar.style.width = Math.round((pageNum / totalPages) * 100) + "%";

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: level.scale });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      const imgData = canvas.toDataURL("image/jpeg", level.quality);

      // Ukuran halaman PDF dalam mm, mengikuti rasio aslinya (1pt = 1/72 inch).
      const pageWidthPt = page.view[2] - page.view[0];
      const pageHeightPt = page.view[3] - page.view[1];
      const widthMm = pageWidthPt * 0.3528;
      const heightMm = pageHeightPt * 0.3528;
      const orientation = widthMm > heightMm ? "l" : "p";

      if (!outputDoc){
        outputDoc = new jsPDF({ orientation, unit: "mm", format: [widthMm, heightMm] });
      }else{
        outputDoc.addPage([widthMm, heightMm], orientation);
      }
      outputDoc.addImage(imgData, "JPEG", 0, 0, widthMm, heightMm);

      canvas.width = 0;
      canvas.height = 0;
    }

    const blob = outputDoc.output("blob");
    const url = URL.createObjectURL(blob);
    const saved = pdfCompressFile.size > 0
      ? Math.round((1 - blob.size / pdfCompressFile.size) * 100)
      : 0;

    status.textContent = "PDF berhasil dikompres!";
    status.className = "remove-bg-status success";
    progressLabel.textContent = "Selesai!";

    const preview = document.getElementById("pdfCompressPreview");
    preview.innerHTML = `
      <div class="ytool-size-compare">
        <span class="ytool-size-chip">Asli: <b>${ytoolFormatBytes(pdfCompressFile.size)}</b></span>
        <span class="ytool-size-chip ${saved > 0 ? 'save' : ''}">Hasil: <b>${ytoolFormatBytes(blob.size)}</b> ${saved > 0 ? `(-${saved}%)` : ''}</span>
      </div>
      ${ytoolDownloadLink(url, "yamada-compress.pdf", "Download PDF", "fa-file-pdf")}
      <p style="margin-top:10px;font-size:11px;color:var(--muted);">
        Catatan: kompresi bekerja dengan mengubah tiap halaman jadi gambar
        terkompresi (${level.label}), jadi hasil PDF tidak lagi bisa
        di-select teksnya.
      </p>
    `;

    trackEvent({ event: "download", tool: "pdfcompress" });
  }catch(error){
    console.error("PDF Compress Error:", error);
    status.textContent = error.message || "Gagal mengompres PDF ini.";
    status.className = "remove-bg-status error";
  }finally{
    button.disabled = false;
    progressWrap.classList.remove("active");
  }
}
