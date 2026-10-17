import { Node } from "./model";

/**
 * Turn a picked image file into the embeddable form: at most `max` pixels on a side, as a data URL under `budget`
 * characters. Photos become JPEG; PNG, GIF and WebP stay PNG so transparency survives. Browser-only.
 */
export async function downscale(blob: Blob, max = 800, budget = 700_000): Promise<NonNullable<Node["image"]>> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    throw new Error("this file is not an image the app can read (PNG, JPEG, GIF and WebP work)");
  }
  const alpha = /png|webp|gif/.test(blob.type);
  let scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d")!;
      if (!alpha) (g.fillStyle = "#fff", g.fillRect(0, 0, w, h));
      g.drawImage(bmp, 0, 0, w, h);
      const src = canvas.toDataURL(alpha ? "image/png" : "image/jpeg", 0.85);
      if (src.length <= budget) return { src, w, h };
      scale *= 0.7; // still too big: try smaller
    }
  } finally {
    bmp.close();
  }
  throw new Error("the image is too large to embed in a map");
}
