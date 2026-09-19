export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.REMOVE_BG_API_KEY || "HiM3WtzbjzeRkawJx3gGPLsf";
; 

    if (!apiKey) {
      return res.status(500).json({
        error: "REMOVE_BG_API_KEY belum tersedia di Vercel"
      });
    }

    const { image, imageName } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: "Gambar tidak ditemukan" });
    }

    // Buang prefix Base64
    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64, "base64");

    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: "image/png" });
    formData.append("image_file", blob, imageName || "image.png");
    formData.append("size", "auto");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Remove.bg Error:", errorText);
      return res.status(response.status).json({
        error: "Remove.bg menolak gambar",
        details: errorText
      });
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
