// Daftarkan Service Worker supaya web bisa diinstall sebagai aplikasi (PWA)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const CONFIG = {
  whatsappChannel: "https://whatsapp.com/channel/0029Vb87O3oF6smw9uLgOD0U",
  customerService: "https://wa.me/6283869485575",
  // Vercel Function akan membaca DOWNLOADER_API_URL dari environment.
  downloadEndpoint: "/api/download",
  // Endpoint khusus Pinterest (format respons API-nya beda dari aio).
  pinterestEndpoint: "/api/download-pinterest",
  // Proxy same-origin supaya file video langsung kedownload (attachment),
  // bukan cuma dibuka sebagai halaman/pemutar video.
  proxyEndpoint: "/api/fetch",

  // Panel admin
  trackEndpoint: "/api/track",
  adminAuthEndpoint: "/api/admin-auth",
  adminStatsEndpoint: "/api/admin-stats",
  adminTokenStorageKey: "yamada_admin_token",

  // Data publik buat nampilin "Tools Populer" di beranda (gak butuh login).
  popularToolsEndpoint: "/api/popular-tools",

  // Downloader Manager (ON/OFF + nama platform) & Maintenance Mode.
  settingsEndpoint: "/api/settings",
  adminSettingsEndpoint: "/api/admin-settings"
};

// Nama platform default (dipakai selama /api/settings belum sempat dimuat,
// atau kalau KV belum disetup di server).
const DEFAULT_PLATFORM_SETTINGS = {
  tiktok: { enabled: true, name: "TikTok" },
  instagram: { enabled: true, name: "Instagram" },
  youtube: { enabled: true, name: "YouTube" },
  pinterest: { enabled: true, name: "Pinterest" }
};

// State pengaturan yang dimuat dari /api/settings, dipakai buat nge-render
// ulang tool card & cek ON/OFF sebelum request download dikirim.
let platformSettings = { ...DEFAULT_PLATFORM_SETTINGS };
let maintenanceSettings = { enabled: false, message: "" };

// Identitas website (Website Setting): nama, deskripsi, logo, link CS.
// Nilai default di sini harus sama persis dengan DEFAULT_SITE di
// api/_lib/settings.mjs, dan dipakai selagi /api/settings belum selesai
// dimuat atau kalau KV belum disetup di server.
const DEFAULT_SITE_SETTINGS = {
  name: "YamadaDownloader",
  description: "YamadaDownloader - download video dari TikTok, Instagram, dan YouTube.",
  logoUrl: "LOGO.jpg",
  csLink: "https://wa.me/6283869485575"
};
let siteSettings = { ...DEFAULT_SITE_SETTINGS };

const tools = {
  youtube: {
    title: "YouTube Downloader",
    desc: "Download video YouTube dan Shorts dengan link publik.",
    icon: "★"
  },
  tiktok: {
    title: "TikTok Downloader",
    desc: "Simpan video TikTok dari link publik yang kamu masukkan.",
    icon:  "𖹭"
  },
  instagram: {
    title: "Instagram Downloader",
    desc: "Download Reels atau video Instagram dari link publik.",
    icon:  "𖦹"
  },
  pinterest: {
    title: "Pinterest Downloader",
    desc: "Download video atau gambar Pinterest dari link publik.",
    icon:  "📌"
  }
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function showToast(message){
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function showBigNotice(message){
  const el = $("#bigNotice");
  if(!el) return;
  const text = $("#bigNoticeText");
  if(text) text.textContent = message || "Sudah Didownload silahkan cek Chrome";
  el.classList.add("show");
  clearTimeout(window.bigNoticeTimer);
  window.bigNoticeTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

// Fire-and-forget tracking buat statistik di Panel Admin.
// Sengaja gak di-await dan errornya diabaikan supaya gak pernah
// mengganggu/memperlambat fitur download utama.
function trackEvent(payload){
  try{
    fetch(CONFIG.trackEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});
  }catch{
    // no-op
  }
}

/* ===================== TOOLS POPULER (BERANDA) ===================== */

// Semua tools yang boleh muncul di beranda sebagai "Tools Populer".
// Daftar LENGKAP semua tools tetap ada statis di halaman "Tools" (All Tools),
// ini cuma dipakai buat nentuin kandidat + tampilan kartu di beranda.
const HOME_TOOL_CATALOG = [
  { id: "youtube",   title: "YouTube",   desc: "Video & Shorts",             icon: "Youtube.jpg" },
  { id: "tiktok",    title: "TikTok",    desc: "Video tanpa ribet",          icon: "Tiktok.jpg" },
  { id: "instagram", title: "Instagram", desc: "Reels & video",              icon: "Instagram.jpg" },
  { id: "pinterest", title: "Pinterest", desc: "Video & gambar",             icon: "Pinterest.jpg" },
  { id: "removebg",  title: "Remove BG", desc: "Hapus background otomatis",  iconClass: "fas fa-wand-magic-sparkles" }
];

// Berapa banyak tool yang ditampilkan di beranda.
const HOME_POPULAR_LIMIT = 4;

function toolCardHTML(tool){
  const iconHTML = tool.iconClass
    ? `<span class="tool-icon"><i class="${tool.iconClass}"></i></span>`
    : `<img src="${tool.icon}" alt="" class="tool-icon">`;

  const clickAttr = tool.id === "removebg"
    ? `type="button" onclick="openRemoveBg()"`
    : `data-tool="${tool.id}"`;

  const disabledAttrs = tool.disabled
    ? `class="tool-card tool-card-disabled" aria-disabled="true"`
    : `class="tool-card"`;

  return `
    <button ${disabledAttrs} ${clickAttr}>
      ${iconHTML}
      <strong>${escapeHtml(tool.title)}</strong>
      <small>${tool.disabled ? "Sedang dinonaktifkan" : tool.desc}</small>
      <span class="arrow">→</span>
    </button>
  `;
}

// Ambil ranking pemakaian tools (data publik, gak butuh login admin) lalu
// render top N di beranda. Kalau data belum ada / gagal diambil, tetap
// tampil pakai urutan default di HOME_TOOL_CATALOG supaya beranda gak kosong.
async function renderPopularTools(){
  const grid = document.getElementById("popularToolsGrid");
  if (!grid) return;

  let ranking = HOME_TOOL_CATALOG.map(t => ({ ...t, count: 0 }));

  try{
    const response = await fetch(CONFIG.popularToolsEndpoint);
    const data = await response.json().catch(() => null);

    if (response.ok && Array.isArray(data?.popularTools) && data.popularTools.length){
      const countMap = {};
      data.popularTools.forEach(item => { countMap[item.tool] = item.count || 0; });

      ranking = HOME_TOOL_CATALOG.map(t => ({ ...t, count: countMap[t.id] || 0 }));
      ranking.sort((a, b) => b.count - a.count);
    }
  }catch{
    // Gagal ambil data popularitas -> tetap pakai urutan default.
  }

  // Terapkan nama & status ON/OFF dari Downloader Manager (kalau ada).
  ranking = ranking.map(t => {
    const setting = platformSettings[t.id];
    if (!setting) return t;
    return { ...t, title: setting.name || t.title, disabled: setting.enabled === false };
  });

  grid.innerHTML = ranking
    .slice(0, HOME_POPULAR_LIMIT)
    .map(toolCardHTML)
    .join("");
}

// Terapkan Downloader Manager (ON/OFF + nama platform) ke semua kartu tool
// yang statis di HTML (halaman "All Tools") dan ke dict `tools` yang dipakai
// openTool(). Dipanggil setelah /api/settings selesai dimuat, dan lagi
// setelah admin nyimpen perubahan dari Panel Admin.
function applyPlatformSettingsToUI(){
  Object.keys(DEFAULT_PLATFORM_SETTINGS).forEach(id => {
    const setting = platformSettings[id] || DEFAULT_PLATFORM_SETTINGS[id];
    if (tools[id]) tools[id].title = setting.name || tools[id].title;

    document.querySelectorAll(`.tool-card[data-tool="${id}"]`).forEach(card => {
      const titleEl = card.querySelector("strong");
      if (titleEl) titleEl.textContent = setting.name || titleEl.textContent;

      card.classList.toggle("tool-card-disabled", setting.enabled === false);
      card.toggleAttribute("aria-disabled", setting.enabled === false);
    });
  });

  renderPopularTools();
}

function setPage(route){
  $$(".page").forEach(p => p.classList.toggle("active", p.dataset.route === route));
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.page === route));
  window.scrollTo({top:0, behavior:"smooth"});
}

function openTool(name){
  const tool = tools[name];
  if (!tool) return;

  const setting = platformSettings[name];
  if (setting && setting.enabled === false){
    showToast(`${setting.name || tool.title} sedang dinonaktifkan oleh admin.`);
    return;
  }

  $("#toolTitle").textContent = tool.title;
  $("#toolDescription").textContent = tool.desc;
  $("#toolBigIcon").textContent = tool.icon;
  $("#videoUrl").value = "";
  $("#resultBox").hidden = true;
  $("#resultBox").className = "result-box";

  const labelMap = {
    youtube: "YouTube",
    tiktok: "TikTok",
    instagram: "Instagram",
    pinterest: "Pinterest"
  };
  $("#videoUrl").placeholder = `Tempel link ${labelMap[name] || ""} di sini...`;

  // Simpan tool aktif supaya downloadVideo() tahu harus panggil endpoint yang mana.
  $("#downloadBtn").dataset.activeTool = name;

  trackEvent({ event: "tool", tool: name });

  setPage("tool");
  setTimeout(() => $("#videoUrl").focus(), 300);
}

/* ===================== PANEL ADMIN ===================== */

function getAdminToken(){
  return sessionStorage.getItem(CONFIG.adminTokenStorageKey) || "";
}

function setAdminToken(token){
  if (token) sessionStorage.setItem(CONFIG.adminTokenStorageKey, token);
  else sessionStorage.removeItem(CONFIG.adminTokenStorageKey);
}

function showPanelLocked(errorMessage){
  $("#panelLocked").hidden = false;
  $("#panelDashboard").hidden = true;

  const errorEl = $("#panelError");
  if (errorMessage){
    errorEl.textContent = errorMessage;
    errorEl.hidden = false;
  } else {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }
}

function showPanelDashboard(){
  $("#panelLocked").hidden = true;
  $("#panelDashboard").hidden = false;
}

// Dipanggil setiap kali user membuka menu "Panel" di bottom nav.
async function openPanel(){
  setPage("panel");

  const token = getAdminToken();
  if (!token){
    showPanelLocked();
    setTimeout(() => $("#panelKeyInput")?.focus(), 250);
    return;
  }

  // Ada token tersimpan dari sesi sebelumnya -> coba langsung tampilkan
  // dashboard, tapi tetap validasi ke server (kalau token sudah expired,
  // server bakal nolak dan kita balik lagi ke form key).
  showPanelDashboard();
  await Promise.all([loadPanelStats(), loadAdminSettings()]);
}

async function unlockPanel(){
  const input = $("#panelKeyInput");
  const key = input.value.trim();
  const btn = $("#panelUnlockBtn");

  if (!key){
    showPanelLocked("Key gak boleh kosong.");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = "<span>⏳</span> Memeriksa...";

  try{
    const response = await fetch(CONFIG.adminAuthEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.token){
      showPanelLocked(data.error || "Key salah.");
      return;
    }

    setAdminToken(data.token);
    input.value = "";
    showPanelDashboard();
    await loadPanelStats();
  }catch(error){
    showPanelLocked("Gagal terhubung ke server: " + error.message);
  }finally{
    btn.disabled = false;
    btn.innerHTML = "<span>🔒</span> Buka Panel";
  }
}

function logoutPanel(){
  setAdminToken(null);
  showPanelLocked();
}

async function loadPanelStats(){
  const token = getAdminToken();
  const list = $("#popularToolsList");
  const kvNotice = $("#panelKvNotice");

  list.innerHTML = "<p class=\"helper\">Memuat data...</p>";
  kvNotice.hidden = true;

  try{
    const response = await fetch(CONFIG.adminStatsEndpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401){
      // Token gak valid / expired -> paksa login ulang.
      setAdminToken(null);
      showPanelLocked("Sesi kamu berakhir, masukkan key lagi.");
      return;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok){
      list.innerHTML = `<p class="helper">Gagal memuat data: ${escapeHtml(data.error || "Unknown error")}</p>`;
      return;
    }

    $("#statTotalVisits").textContent = (data.totalVisits ?? 0).toLocaleString("id-ID");

    const popularTools = Array.isArray(data.popularTools) ? data.popularTools : [];
    $("#statToolsUsed").textContent = popularTools
      .reduce((sum, t) => sum + (t.count || 0), 0)
      .toLocaleString("id-ID");

    // Statistik Dashboard: Total Download, Download Hari Ini, API Request,
    // Request Gagal, Status API.
    $("#statTotalDownloads").textContent = (data.totalDownloads ?? 0).toLocaleString("id-ID");
    $("#statDownloadsToday").textContent = (data.downloadsToday ?? 0).toLocaleString("id-ID");
    $("#statApiRequests").textContent = (data.apiRequests ?? 0).toLocaleString("id-ID");
    $("#statApiFailed").textContent = (data.apiFailed ?? 0).toLocaleString("id-ID");
    renderApiStatusBadge(data.apiStatus);

    if (!popularTools.length){
      list.innerHTML = "<p class=\"helper\">Belum ada data pemakaian tools.</p>";
    } else {
      list.innerHTML = popularTools
        .map((t, i) => `
          <div class="popular-tool-row">
            <span><span class="popular-tool-rank">#${i + 1}</span><b>${escapeHtml(t.tool)}</b></span>
            <span>${(t.count || 0).toLocaleString("id-ID")}x</span>
          </div>
        `)
        .join("");
    }

    if (data.kvConfigured === false && data.notice){
      kvNotice.textContent = data.notice;
      kvNotice.hidden = false;
    }
  }catch(error){
    list.innerHTML = `<p class="helper">Gagal terhubung ke server: ${escapeHtml(error.message)}</p>`;
  }
}

function renderApiStatusBadge(apiStatus){
  const badge = $("#statApiStatus");
  const timeEl = $("#statApiStatusTime");
  if (!badge) return;

  const status = apiStatus?.status || "unknown";
  badge.classList.remove("panel-status-online", "panel-status-offline", "panel-status-unknown");

  if (status === "online"){
    badge.classList.add("panel-status-online");
    badge.textContent = "● Online";
  } else if (status === "offline"){
    badge.classList.add("panel-status-offline");
    badge.textContent = "● Offline";
  } else {
    badge.classList.add("panel-status-unknown");
    badge.textContent = "● Belum ada data";
  }

  if (timeEl){
    timeEl.textContent = apiStatus?.at
      ? `Terakhir dicek: ${new Date(apiStatus.at).toLocaleString("id-ID")}`
      : "";
  }
}

/* ===================== DOWNLOADER MANAGER & MAINTENANCE (ADMIN) ===================== */

// Ambil pengaturan Downloader Manager + Maintenance Mode dari server dan
// isikan ke form Panel Admin.
async function loadAdminSettings(){
  const token = getAdminToken();
  if (!token) return;

  try{
    const response = await fetch(CONFIG.adminSettingsEndpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) return; // biarkan loadPanelStats() yang menangani sesi expired

    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;

    if (data.platforms){
      platformSettings = data.platforms;
      applyPlatformSettingsToUI();

      Object.keys(DEFAULT_PLATFORM_SETTINGS).forEach(id => {
        const setting = data.platforms[id];
        if (!setting) return;

        const toggle = document.querySelector(`.platform-toggle[data-platform="${id}"]`);
        const nameInput = document.querySelector(`.platform-name-input[data-platform="${id}"]`);
        const row = document.querySelector(`[data-platform-row="${id}"]`);

        if (toggle) toggle.checked = setting.enabled !== false;
        if (nameInput) nameInput.value = setting.name || "";
        if (row) row.classList.toggle("platform-disabled", setting.enabled === false);
      });
    }

    if (data.maintenance){
      maintenanceSettings = data.maintenance;

      const toggle = $("#maintenanceToggle");
      const messageInput = $("#maintenanceMessageInput");
      if (toggle) toggle.checked = Boolean(data.maintenance.enabled);
      if (messageInput) messageInput.value = data.maintenance.message || "";
    }

    if (data.site){
      applySiteSettingsToUI(data.site);

      const nameInput = $("#siteNameInput");
      const descInput = $("#siteDescriptionInput");
      const logoInput = $("#siteLogoInput");
      const logoPreview = $("#siteLogoPreview");
      const csInput = $("#siteCsLinkInput");

      if (nameInput) nameInput.value = data.site.name || "";
      if (descInput) descInput.value = data.site.description || "";
      if (logoInput) logoInput.value = data.site.logoUrl || "";
      if (logoPreview) logoPreview.src = data.site.logoUrl || DEFAULT_SITE_SETTINGS.logoUrl;
      if (csInput) csInput.value = data.site.csLink || "";
    }
  }catch{
    // Kalau gagal, form biarin nampilin data terakhir yang berhasil dimuat.
  }
}

// Simpan perubahan ke server. `payload` cuma berisi bagian yang mau diubah
// (platforms saja, atau maintenance saja).
async function saveAdminSettings(payload, statusElId){
  const token = getAdminToken();
  const statusEl = statusElId ? $(statusElId) : null;

  if (!token){
    showToast("Sesi admin gak ditemukan, silakan login ulang.");
    return;
  }

  try{
    const response = await fetch(CONFIG.adminSettingsEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401){
      setAdminToken(null);
      showPanelLocked("Sesi kamu berakhir, masukkan key lagi.");
      return;
    }

    if (!response.ok){
      throw new Error(data.error || "Gagal menyimpan pengaturan.");
    }

    if (data.platforms){
      platformSettings = data.platforms;
      applyPlatformSettingsToUI();
    }
    if (data.maintenance){
      maintenanceSettings = data.maintenance;
      applyMaintenanceState(data.maintenance);
    }
    if (data.site){
      applySiteSettingsToUI(data.site);
      const logoPreview = $("#siteLogoPreview");
      if (logoPreview) logoPreview.src = data.site.logoUrl || DEFAULT_SITE_SETTINGS.logoUrl;
    }

    if (statusEl){
      statusEl.textContent = "✔ Pengaturan berhasil disimpan.";
      statusEl.hidden = false;
      setTimeout(() => { statusEl.hidden = true; }, 3000);
    }
    showToast("Pengaturan disimpan.");
  }catch(error){
    if (statusEl){
      statusEl.textContent = `Gagal menyimpan: ${error.message}`;
      statusEl.hidden = false;
    }
    showToast(`Gagal menyimpan: ${error.message}`);
  }
}

function collectPlatformFormPayload(){
  const platforms = {};
  document.querySelectorAll(".platform-toggle").forEach(toggle => {
    const id = toggle.dataset.platform;
    if (!id) return;
    const nameInput = document.querySelector(`.platform-name-input[data-platform="${id}"]`);
    platforms[id] = {
      enabled: toggle.checked,
      name: nameInput ? nameInput.value.trim() : undefined
    };
  });
  return platforms;
}

async function saveDownloaderManager(){
  await saveAdminSettings({ platforms: collectPlatformFormPayload() }, "#platformSaveStatus");
}

async function saveMaintenanceMode(){
  const toggle = $("#maintenanceToggle");
  const messageInput = $("#maintenanceMessageInput");

  await saveAdminSettings({
    maintenance: {
      enabled: toggle ? toggle.checked : false,
      message: messageInput ? messageInput.value.trim() : ""
    }
  }, "#maintenanceSaveStatus");
}

/* ===================== WEBSITE SETTING (nama, deskripsi, logo, CS) ===================== */

// Terapkan identitas website ke seluruh elemen terkait: title tab, meta
// description, favicon, semua logo (.site-logo-img), nama brand di topbar &
// status card & splash screen, serta link Customer Service.
function applySiteSettingsToUI(site){
  siteSettings = { ...DEFAULT_SITE_SETTINGS, ...(site || {}) };

  document.title = siteSettings.name;

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", siteSettings.description);

  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) favicon.href = siteSettings.logoUrl;

  document.querySelectorAll(".site-logo-img").forEach(img => {
    img.src = siteSettings.logoUrl;
  });

  const brandNameText = $("#brandNameText");
  if (brandNameText) brandNameText.textContent = siteSettings.name;

  const statusHeadName = $("#statusHeadName");
  if (statusHeadName) statusHeadName.textContent = siteSettings.name;

  const splashName = $("#splashName");
  if (splashName) splashName.textContent = siteSettings.name;

  const panelHeroName = $("#panelHeroName");
  if (panelHeroName) panelHeroName.textContent = siteSettings.name;

  const csLink = $("#csLink");
  if (csLink) csLink.href = siteSettings.csLink;
  CONFIG.customerService = siteSettings.csLink;
}

function collectSiteFormPayload(){
  return {
    name: $("#siteNameInput")?.value.trim(),
    description: $("#siteDescriptionInput")?.value.trim(),
    logoUrl: $("#siteLogoInput")?.value.trim(),
    csLink: $("#siteCsLinkInput")?.value.trim()
  };
}

async function saveWebsiteSetting(){
  await saveAdminSettings({ site: collectSiteFormPayload() }, "#siteSaveStatus");
}

/* ===================== MAINTENANCE MODE (PENGUNJUNG) ===================== */

function applyMaintenanceState(maintenance){
  maintenanceSettings = maintenance || { enabled: false, message: "" };

  if (maintenanceSettings.enabled){
    showMaintenanceOverlay(maintenanceSettings.message);
  } else {
    hideMaintenanceOverlay();
  }
}

function showMaintenanceOverlay(message){
  const overlay = $("#maintenanceOverlay");
  if (!overlay) return;

  const textEl = $("#maintenanceMessage");
  if (textEl) textEl.textContent = message || "Website sedang dalam perbaikan. Silakan coba lagi beberapa saat lagi.";

  overlay.hidden = false;
  document.body.classList.add("maintenance-active");
}

function hideMaintenanceOverlay(){
  const overlay = $("#maintenanceOverlay");
  if (!overlay) return;

  overlay.hidden = true;
  document.body.classList.remove("maintenance-active");
}

// Dipanggil sekali saat web dibuka, dan lagi tiap kali tombol "Coba Lagi"
// di-klik. Gagal fetch gak boleh sampai bikin web keblokir permanen, jadi
// errornya didiamkan saja (web tetap bisa dipakai seperti biasa).
async function loadPublicSettings(){
  try{
    const response = await fetch(CONFIG.settingsEndpoint, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!data) return;

    if (data.platforms){
      platformSettings = data.platforms;
      applyPlatformSettingsToUI();
    }

    if (data.maintenance){
      applyMaintenanceState(data.maintenance);
    }

    if (data.site){
      applySiteSettingsToUI(data.site);
    }
  }catch{
    // no-op — biarkan web tetap bisa dipakai kalau /api/settings gagal diambil.
  }
}

async function pasteUrl(){
  try{
    const text = await navigator.clipboard.readText();
    if(!text) throw new Error();
    $("#videoUrl").value = text;
    showToast("Link berhasil ditempel.");
  }catch{
    showToast("Clipboard tidak bisa dibaca. Tempel link secara manual.");
  }
}

function getActivePlatform(){
  return $("#downloadBtn")?.dataset.activeTool || "";
}

function getActiveDownloadEndpoint(){
  const activeTool = getActivePlatform();
  return activeTool === "pinterest" ? CONFIG.pinterestEndpoint : CONFIG.downloadEndpoint;
}

async function downloadVideo(){
  const input = $("#videoUrl");
  const url = input.value.trim();
  const box = $("#resultBox");
  const btn = $("#downloadBtn");

  if(!url || !/^https?:\/\//i.test(url)){
    box.hidden = false;
    box.className = "result-box error";
    box.innerHTML = "<strong>Link belum valid.</strong><br>Masukkan URL video yang diawali http:// atau https://.";
    return;
  }

  btn.disabled = true;
  btn.innerHTML = "<span>⏳</span> Memproses...";
  box.hidden = false;
  box.className = "result-box";
  box.innerHTML = "Sedang mengambil informasi video...";

  try{
    const response = await fetch(getActiveDownloadEndpoint(), {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({url, platform: getActivePlatform()})
    });

    const data = await response.json().catch(() => ({}));

    // Server lagi mode maintenance -> tampilkan overlay maintenance,
    // bukan pesan error box biasa.
    if (response.status === 503 && data.maintenance){
      applyMaintenanceState({ enabled: true, message: data.error });
      box.hidden = true;
      return;
    }

    if(!response.ok || data.error){
      throw new Error(data.error || "Downloader API belum dikonfigurasi atau link tidak dapat diproses.");
    }

    renderDownloadResult(data);

   }catch(error){
    console.error("Download error:", error);

    box.className = "result-box error";
    box.innerHTML =
      `<strong>Download belum dapat diproses.</strong><br>` +
      `${escapeHtml(error.message)}<br>` +
      `<small>Pastikan DOWNLOADER_API_URL sudah diisi di Vercel dan API downloader kamu aktif.</small>`;
  }finally{
    btn.disabled = false;
    btn.innerHTML = "<span>↓</span> Download Video";
  }
}

function renderDownloadResult(data){
  const box = $("#resultBox");
  box.className = "result-box";

  if(data.status !== "picker" || !Array.isArray(data.picker)){
    throw new Error("API tidak mengembalikan pilihan media.");
  }

  const items = data.picker.filter(item => item?.url);

  if(!items.length){
    throw new Error("Tidak ada media yang bisa diunduh.");
  }

  const title = data.title
    ? `<div style="margin-bottom:8px">
        <strong>${escapeHtml(data.title)}</strong>
      </div>`
    : "";

  const author = data.author
    ? `<small>Creator: ${escapeHtml(data.author)}</small>`
    : "";

  const firstItem = items[0];
  const isImage = /gambar|image|jpg|jpeg|png|webp/i.test(
    `${firstItem?.type || ""} ${firstItem?.extension || ""}`
  );

  const mediaPreview = firstItem?.url
    ? (isImage
        ? `
          <img
            src="${escapeAttr(firstItem.url)}"
            alt="${escapeAttr(data.title || "Preview")}"
            style="width:100%;max-height:420px;object-fit:contain;border-radius:14px;margin-top:12px;background:#000"
          >
        `
        : `
          <video
            controls
            playsinline
            preload="metadata"
            style="width:100%;max-height:420px;border-radius:14px;margin-top:12px;background:#000"
            src="${escapeAttr(firstItem.url)}">
          </video>
        `)
    : "";

  box.innerHTML = `
    ${title}
    ${author}

    ${mediaPreview}

    <div style="margin-top:14px">
      <strong>Pilih format</strong>
    </div>

    <div class="download-list" style="margin-top:8px">
      ${items.map((item, index) => `
        <button
          type="button"
          class="download-option"
          data-media-index="${index}"
        >
          <span>
            ${escapeHtml(item.type || "Media")}
            ${item.quality ? ` • ${escapeHtml(item.quality)}` : ""}
          </span>

          <span>Download →</span>
        </button>
      `).join("")}
    </div>
  `;

  $$(".download-option[data-media-index]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.mediaIndex);

      downloadSelectedMedia(
        $("#videoUrl").value.trim(),
        index,
        data.title || "YamadaDownloader",
        items[index]?.extension || "mp4",
        button
      );
    });
  });
}

async function downloadSelectedMedia(
  originalUrl,
  mediaIndex,
  title,
  extension,
  button
) {
  if (!originalUrl) {
    showToast("Link video tidak ditemukan.");
    return;
  }

  const originalLabel = button.innerHTML;

  button.disabled = true;
  button.innerHTML = "<span>⏳ Memproses...</span>";

  try {
    const response = await fetch(getActiveDownloadEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: originalUrl,
        download: true,
        mediaIndex: mediaIndex,
        platform: getActivePlatform()
      })
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 503 && data.maintenance){
      applyMaintenanceState({ enabled: true, message: data.error });
      return;
    }

    if (!response.ok) {
      throw new Error(
        data.error || `HTTP ${response.status}`
      );
    }

    if (!data.url) {
      throw new Error("URL download tidak diberikan API.");
    }

    // Buat nama file
    const safeTitle = String(title || "YamadaDownloader")
      .replace(/[\\/:*?"<>|]/g, "")
      .trim();

    const safeExtension = String(extension || "mp4")
      .replace(/[^a-zA-Z0-9]/g, "");

    const fileName =
      `${safeTitle || "YamadaDownloader"}.${safeExtension || "mp4"}`;

    // PENTING: jangan arahkan <a> langsung ke URL CDN pihak ketiga.
    // URL CDN itu cross-origin, jadi atribut `download` diabaikan browser,
    // linknya cuma "dibuka" seperti halaman video biasa -> muncul dialog
    // native "Download file lagi?" yang bikin bingung.
    // Solusinya: proxy file itu lewat /api/fetch (same-origin) dengan
    // header Content-Disposition: attachment, supaya begitu diklik file
    // LANGSUNG kedownload tanpa dialog konfirmasi tambahan.
    const proxyUrl =
      `${CONFIG.proxyEndpoint}?url=${encodeURIComponent(data.url)}` +
      `&filename=${encodeURIComponent(fileName)}`;

    const link = document.createElement("a");

    link.href = proxyUrl;
    link.download = fileName;

    // JANGAN gunakan target="_blank"
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    showToast("✔ Download dimulai!");
    showBigNotice("Sudah Didownload, silahkan cek Chrome");

  } catch (error) {
    console.error("Download error:", error);

    showToast(`Gagal: ${error.message}`);

  } finally {
    button.disabled = false;
    button.innerHTML = originalLabel;
  }
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function escapeAttr(value){ return escapeHtml(value); }

function initPWA(){
  let deferredPrompt;
  const installBtn = $("#installBtn");
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener("click", async () => {
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });
}

function initDeviceStatus() {
  const typeEl = document.querySelector("#deviceType");
  const statusEl = document.querySelector("#deviceBatteryStatus");

  // Kalau elemen tidak ada, jangan hentikan JavaScript lainnya
  if (!typeEl && !statusEl) return;

  // =========================
  // DETEKSI PERANGKAT
  // =========================
  const ua = navigator.userAgent || "";

  let deviceLabel = "Desktop";

  if (
    /iPad|Tablet/i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua))
  ) {
    deviceLabel = "Tablet";
  } else if (
    /Mobi|Android|iPhone|iPod/i.test(ua)
  ) {
    deviceLabel = "Handphone";
  }

  if (typeEl) {
    typeEl.textContent = deviceLabel;
  }

  // =========================
  // STATUS BATERAI
  // =========================
  function updateBattery(battery) {
    if (!statusEl) return;

    const level = Number(battery.level);

    // Cegah NaN / nilai aneh
    if (!Number.isFinite(level)) {
      statusEl.textContent = "Tidak tersedia";
      return;
    }

    const percent = Math.max(
      0,
      Math.min(100, Math.round(level * 100))
    );

    // Reset class
    statusEl.classList.remove("low", "medium");

    if (percent <= 20) {
      statusEl.classList.add("low");
    } else if (percent <= 50) {
      statusEl.classList.add("medium");
    }

    if (battery.charging) {
      statusEl.textContent =
        `${percent}% • Mengisi daya`;
    } else {
      statusEl.textContent =
        `${percent}% • Tidak mengisi`;
    }
  }

  // =========================
  // CEK BATTERY API
  // =========================
  if (
    typeof navigator.getBattery !== "function"
  ) {
    if (statusEl) {
      statusEl.textContent = "Tidak tersedia";
    }

    return;
  }

  navigator
    .getBattery()
    .then(function (battery) {
      if (!battery) {
        if (statusEl) {
          statusEl.textContent = "Tidak tersedia";
        }
        return;
      }

      // Tampilkan status awal
      updateBattery(battery);

      // Update ketika persentase berubah
      battery.addEventListener(
        "levelchange",
        function () {
          updateBattery(battery);
        }
      );

      // Update ketika mulai/berhenti charging
      battery.addEventListener(
        "chargingchange",
        function () {
          updateBattery(battery);
        }
      );
    })
    .catch(function () {
      if (statusEl) {
        statusEl.textContent = "Tidak tersedia";
      }
    });
}

// =================================
// YAMADA DOWNLOADER LOADING SCREEN
// =================================

function initLoadingScreen(){

  const loadingScreen = document.getElementById("loadingScreen");
  const loadingText = document.getElementById("loadingText");
  const loadingBar = document.getElementById("loadingBar");
  const loadingPercent = document.getElementById("loadingPercent");

  if(!loadingScreen || !loadingText || !loadingBar){
    return;
  }

  const texts = [
    "YAMADA",
    "ADALAH",
    "TEMPAT",
    "MEDOWNLOAD",
    "LINK VIDEO",
    "DAN LAINNYA"
  ];

  let progress = 0;
  let textIndex = 0;

  // Ganti text setiap beberapa saat
  const textInterval = setInterval(() => {

    textIndex++;

    if(textIndex >= texts.length){
      textIndex = 0;
    }

    loadingText.classList.remove("change");

    // restart animation
    void loadingText.offsetWidth;

    loadingText.textContent = texts[textIndex];
    loadingText.classList.add("change");

  }, 500);


  // Loading progress
  const progressInterval = setInterval(() => {

    progress += Math.random() * 5 + 2;

    if(progress >= 100){
      progress = 100;
    }

    loadingBar.style.width = `${progress}%`;

    if(loadingPercent){
      loadingPercent.textContent = `${Math.floor(progress)}%`;
    }

    if(progress >= 100){

      clearInterval(progressInterval);
      clearInterval(textInterval);

      setTimeout(() => {

        loadingScreen.classList.add("hide");

        setTimeout(() => {
          loadingScreen.remove();
        }, 750);

      }, 350);

    }

  }, 100);

}

document.addEventListener("DOMContentLoaded", () => {

  // =========================
  // LOADING SCREEN
  // =========================

  initLoadingScreen();

  // =========================
  // WHATSAPP NOTICE
  // =========================

  const notice = $("#waNotice");
  const waLink = $("#waLink");
  const csLink = $("#csLink");

  if (waLink) {
    waLink.href = CONFIG.whatsappChannel;
  }

  if (csLink) {
    csLink.href = CONFIG.customerService;
  }

  if (notice) {
    setTimeout(() => notice.classList.add("show"), 1000);
    setTimeout(() => notice.classList.remove("show"), 6000);
  }

  const closeNotice = $("#closeNotice");

  if (closeNotice) {
    closeNotice.addEventListener("click", () => {
      notice?.classList.remove("show");
    });
  }

  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;
      if (!page) return;
      // "panel" butuh cek key dulu, jadi ditangani terpisah lewat openPanel().
      if (page === "panel"){
        openPanel();
        return;
      }
      setPage(page);
    });
  });

  const panelUnlockBtn = $("#panelUnlockBtn");
  if (panelUnlockBtn){
    panelUnlockBtn.addEventListener("click", unlockPanel);
  }

  const panelKeyInput = $("#panelKeyInput");
  if (panelKeyInput){
    panelKeyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") unlockPanel();
    });
  }

  const panelRefreshBtn = $("#panelRefreshBtn");
  if (panelRefreshBtn){
    panelRefreshBtn.addEventListener("click", () => {
      loadPanelStats();
      loadAdminSettings();
    });
  }

  const panelLogoutBtn = $("#panelLogoutBtn");
  if (panelLogoutBtn){
    panelLogoutBtn.addEventListener("click", logoutPanel);
  }

  // ===== Downloader Manager & Maintenance Mode (Panel Admin) =====
  const platformSaveBtn = $("#platformSaveBtn");
  if (platformSaveBtn){
    platformSaveBtn.addEventListener("click", saveDownloaderManager);
  }

  const maintenanceSaveBtn = $("#maintenanceSaveBtn");
  if (maintenanceSaveBtn){
    maintenanceSaveBtn.addEventListener("click", saveMaintenanceMode);
  }

  // ===== Website Setting (Panel Admin) =====
  const siteSaveBtn = $("#siteSaveBtn");
  if (siteSaveBtn){
    siteSaveBtn.addEventListener("click", saveWebsiteSetting);
  }

  // Preview logo langsung berubah begitu admin ngetik URL baru, sebelum
  // disimpan — biar kelihatan hasilnya duluan.
  const siteLogoInput = $("#siteLogoInput");
  const siteLogoPreview = $("#siteLogoPreview");
  if (siteLogoInput && siteLogoPreview){
    siteLogoInput.addEventListener("input", () => {
      siteLogoPreview.src = siteLogoInput.value.trim() || DEFAULT_SITE_SETTINGS.logoUrl;
    });
  }

  // ===== Overlay Maintenance Mode (tampilan pengunjung) =====
  const maintenanceRetryBtn = $("#maintenanceRetryBtn");
  if (maintenanceRetryBtn){
    maintenanceRetryBtn.addEventListener("click", async () => {
      const originalLabel = maintenanceRetryBtn.innerHTML;
      maintenanceRetryBtn.disabled = true;
      maintenanceRetryBtn.innerHTML = "<span>⏳</span> Memeriksa...";
      await loadPublicSettings();
      maintenanceRetryBtn.disabled = false;
      maintenanceRetryBtn.innerHTML = originalLabel;
    });
  }

  const maintenanceAdminLink = $("#maintenanceAdminLink");
  if (maintenanceAdminLink){
    maintenanceAdminLink.addEventListener("click", () => {
      hideMaintenanceOverlay();
      openPanel();
    });
  }

  // Track pengunjung sekali tiap kali web dibuka/di-reload.
  trackEvent({ event: "visit" });

  // Render daftar "Tools Populer" di beranda berdasarkan data pemakaian asli.
  renderPopularTools();

  // Cek status maintenance & Downloader Manager sekali di awal, supaya
  // pengunjung baru langsung lihat kondisi terbaru dari Panel Admin.
  loadPublicSettings();

    const bigNotice = $("#bigNotice");
  if (bigNotice) {
    bigNotice.addEventListener("click", () => bigNotice.classList.remove("show"));
  }

  // Delegated click listener: tetap jalan walau tool-card di-render ulang
  // secara dinamis (misal daftar "Tools Populer" di beranda yang di-refresh
  // dari data statistik), karena listener-nya nempel di document, bukan
  // di masing-masing tombol satu-satu.
  document.addEventListener("click", (event) => {
    const card = event.target.closest(".tool-card[data-tool]");
    if (!card) return;
    const tool = card.dataset.tool;
    if (tool) openTool(tool);
  });

  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;
      if (page) {
        setPage(page);
      }
    });
  });

  const pasteBtn = $("#pasteBtn");
  if (pasteBtn) {
    pasteBtn.addEventListener("click", pasteUrl);
  }

  const downloadBtn = $("#downloadBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadVideo);
  }

  const videoUrl = $("#videoUrl");
  if (videoUrl) {
    videoUrl.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        downloadVideo();
      }
    });
  }

  const themeToggle = $("#themeToggle");
  const themeIcon = $("#themeIcon");

  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem("theme");
  } catch {}

  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    if (themeIcon) themeIcon.textContent = "🌙";
  } else {
    document.body.classList.remove("dark-mode");
    if (themeIcon) themeIcon.textContent = "☀️";
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
      const dark = document.body.classList.contains("dark-mode");
      try {
        localStorage.setItem("theme", dark ? "dark" : "light");
      } catch {}
      if (themeIcon) themeIcon.textContent = dark ? "🌙" : "☀️";
    });
  }

  initDeviceStatus();
  initPWA();
});

// ========================================
// YAMADA REMOVE BACKGROUND
// ========================================

let removeBgSelectedFile = null;


// Buka modal
function openRemoveBg() {

  const modal =
    document.getElementById(
      "removeBgModal"
    );

  if (!modal) return;

  trackEvent({ event: "tool", tool: "removebg" });

  modal.classList.add("active");
}


// Tutup modal
function closeRemoveBg() {

  const modal =
    document.getElementById(
      "removeBgModal"
    );

  if (!modal) return;

  modal.classList.remove("active");
}


// Pilih gambar
document.addEventListener(
  "change",
  function (event) {

    if (
      event.target.id !==
      "removeBgFile"
    ) {
      return;
    }

    const file =
      event.target.files?.[0];

    if (!file) return;

    removeBgSelectedFile =
      file;

    const preview =
      document.getElementById(
        "removeBgPreview"
      );

    const imageURL =
      URL.createObjectURL(file);

    preview.innerHTML = `
      <img
        src="${imageURL}"
        alt="Preview"
      >
    `;

    preview.style.display =
      "block";

  }
);


// Proses Remove BG
async function processRemoveBg() {

  const button =
    document.getElementById(
      "removeBgButton"
    );

  const status =
    document.getElementById(
      "removeBgStatus"
    );

  if (!removeBgSelectedFile) {

    status.textContent =
      "Pilih gambar terlebih dahulu.";

    status.className =
      "remove-bg-status error";

    return;
  }


  button.disabled = true;

  status.textContent =
    "Menghapus background...";

  status.className =
    "remove-bg-status";


  try {

    // File → Base64
    const base64 =
      await fileToBase64(
        removeBgSelectedFile
      );


    const response =
      await fetch(
        "/api/removebg",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            image: base64,

            imageName:
              removeBgSelectedFile.name
          })
        }
      );


    if (!response.ok) {

      let errorMessage =
        "Gagal memproses gambar.";

      try {

        const error =
          await response.json();

        errorMessage =
          error.error ||
          errorMessage;

      } catch {}

      throw new Error(
        errorMessage
      );
    }


    const blob =
      await response.blob();


    const resultURL =
      URL.createObjectURL(blob);


    status.textContent =
      "Background berhasil dihapus!";

    status.className =
      "remove-bg-status success";


    const preview =
      document.getElementById(
        "removeBgPreview"
      );


    preview.innerHTML = `
      <div class="remove-bg-result">

        <img
          src="${resultURL}"
          alt="Hasil Remove Background"
        >

        <a
               
          href="${resultURL}"
          download="yamada-removebg.png"
          class="remove-bg-button"
          onclick="showBigNotice('Sudah Didownload silahkan cek Chrome')"
          style="
            display:block;
            text-decoration:none;
            text-align:center;
          "
        >
          <i class="fas fa-download"></i>
          Download Hasil
        </a>

      </div>
    `;


  } catch (error) {

    console.error(
      "Remove BG Error:",
      error
    );

    status.textContent =
      error.message ||
      "Gagal menghapus background.";

    status.className =
      "remove-bg-status error";

  } finally {

    button.disabled = false;

  }

}


// File → Base64
function fileToBase64(file) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onload =
        () => resolve(
          reader.result
        );

      reader.onerror =
        () => reject(
          new Error(
            "Gagal membaca gambar."
          )
        );

      reader.readAsDataURL(
        file
      );

    }
  );

}
