// Remove Background via remove.bg.
// API key WAJIB diisi lewat Environment Variable REMOVE_BG_API_KEY di Vercel.
// (Versi lama menyimpan key di dalam kode — key itu sudah bocor, ganti/revoke.)

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|webp));base64,/i;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "REMOVE_BG_API_KEY belum diisi di Environment Variables Vercel."
    });
  }

  try {
    const { image, imageName } = req.body || {};
    const dataUrl = String(image || "");
    const match = DATA_URL_RE.exec(dataUrl.slice(0, 40));

    if (!match) {
      return res.status(400).json({ error: "Gambar tidak valid. Gunakan PNG, JPG, atau WEBP." });
    }

    const imageBuffer = Buffer.from(dataUrl.slice(match[0].length), "base64");

    if (!imageBuffer.length) {
      return res.status(400).json({ error: "Gambar tidak ditemukan" });
    }
    if (imageBuffer.length > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: "Gambar terlalu besar (maksimal 8 MB)." });
    }

    const safeName = String(imageName || "image.png").replace(/[^\w.\-]+/g, "_").slice(0, 80) || "image.png";

    const formData = new FormData();
    formData.append("image_file", new Blob([imageBuffer], { type: match[1].toLowerCase() }), safeName);
    formData.append("size", "auto");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Remove.bg Error:", response.status, errorText);

      const friendly =
        response.status === 402 ? "Kuota remove.bg habis. Hubungi admin." :
        response.status === 403 ? "API key remove.bg tidak valid. Hubungi admin." :
        response.status === 429 ? "Terlalu banyak permintaan, coba lagi sebentar." :
        "Remove.bg menolak gambar ini.";

      // Detail error asli hanya masuk log server, tidak dikirim ke pengunjung.
      return res.status(response.status).json({ error: friendly });
    }

    const result = await response.arrayBuffer();

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(result));
  } catch (error) {
    console.error("RemoveBG:", error);
    return res.status(500).json({ error: "Gagal menghapus background" });
  }
}
