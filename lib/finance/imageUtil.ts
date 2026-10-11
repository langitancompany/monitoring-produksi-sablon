// lib/finance/imageUtil.ts  (BROWSER ONLY)
// Kecilkan gambar upload (header / TTD) menjadi data URL ringan sebelum dikirim ke server.
// PNG tetap PNG (menjaga transparansi TTD); format lain jadi JPEG.

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      resolve(im);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("File bukan gambar yang valid"));
    };
    im.src = url;
  });
}

export async function fileToDataUrl(
  file: File,
  opts: { maxWidth: number; maxChars: number },
): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error("Gunakan gambar PNG, JPG, atau WebP");
  }
  const im = await loadImage(file);
  const isPng = file.type === "image/png";

  let scale = Math.min(1, opts.maxWidth / im.naturalWidth);
  for (let attempt = 0; attempt < 6; attempt++) {
    const w = Math.max(1, Math.round(im.naturalWidth * scale));
    const h = Math.max(1, Math.round(im.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak mendukung pengolahan gambar");
    if (!isPng) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(im, 0, 0, w, h);
    const out = isPng
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", Math.max(0.6, 0.92 - attempt * 0.08));
    if (out.length <= opts.maxChars) return out;
    scale *= 0.8;
  }
  throw new Error("Gambar terlalu besar. Perkecil dimensinya lalu coba lagi.");
}