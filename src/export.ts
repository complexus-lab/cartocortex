import { Box, Node, findNode, visibleIds } from "./model";
import { summaryD, summaryGeo } from "./summary";

/** Point on box `b`'s border in the direction of (tx, ty). */
export function edgePoint(b: Box, tx: number, ty: number) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
  const s = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * s, y: cy + dy * s };
}

/** Curve from parent `p` to child `b`, leaving on the side the child grows towards. */
export function branchD(b: Box, p: Box) {
  const left = b.side === -1;
  const x0 = left ? p.x : p.x + p.w, y0 = p.y + p.h / 2, x1 = left ? b.x + b.w : b.x, y1 = b.y + b.h / 2, mx = (x0 + x1) / 2;
  return `M${x0} ${y0} C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
}

/** Curved relationship line between two boxes, border to border. */
export function relD(f: Box, t: Box) {
  const a = edgePoint(f, t.x + t.w / 2, t.y + t.h / 2), z = edgePoint(t, f.x + f.w / 2, f.y + f.h / 2);
  const len = Math.hypot(z.x - a.x, z.y - a.y) || 1;
  const cx = (a.x + z.x) / 2 - ((z.y - a.y) / len) * len * 0.2, cy = (a.y + z.y) / 2 + ((z.x - a.x) / len) * len * 0.2;
  return `M${a.x} ${a.y} Q${cx} ${cy} ${z.x} ${z.y}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Standalone light-theme SVG of the whole visible map. */
export function mapSvg(root: Node, boxes: Box[], colorOf: (b: Box) => string) {
  const pad = 40;
  const sums = (root.summaries ?? []).flatMap((s) => {
    const g = summaryGeo(root, boxes, s);
    return g ? [{ s, g }] : [];
  });
  const rects = [...boxes, ...sums.map(({ g }) => g.label)];
  const x0 = Math.min(...rects.map((b) => b.x)) - pad, y0 = Math.min(...rects.map((b) => b.y)) - pad;
  const w = Math.ceil(Math.max(...rects.map((b) => b.x + b.w)) + pad - x0);
  const h = Math.ceil(Math.max(...rects.map((b) => b.y + b.h)) + pad - y0);
  const byId = Object.fromEntries(boxes.map((b) => [b.id, b]));
  const out: string[] = [];

  for (const id of root.bounds ?? []) {
    const bs = byId[id] ? visibleIds(findNode(root, id)!).map((x) => byId[x]).filter(Boolean) : [];
    if (!bs.length) continue;
    const bx = Math.min(...bs.map((b) => b.x)) - 12, by = Math.min(...bs.map((b) => b.y)) - 12;
    const bw = Math.max(...bs.map((b) => b.x + b.w)) + 12 - bx, bh = Math.max(...bs.map((b) => b.y + b.h)) + 12 - by;
    const c = colorOf(byId[id]);
    out.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="14" fill="${c}" fill-opacity=".08" stroke="${c}" stroke-width="2" stroke-dasharray="6 4"/>`);
  }
  for (const b of boxes) if (b.parent) out.push(`<path d="${branchD(b, byId[b.parent])}" fill="none" stroke="${colorOf(b)}" stroke-width="2"/>`);
  for (const r of root.rels ?? []) {
    if (byId[r.from] && byId[r.to]) out.push(`<path d="${relD(byId[r.from], byId[r.to])}" fill="none" stroke="#6b7385" stroke-width="1.5" stroke-dasharray="6 4" marker-end="url(#arr)"/>`);
  }
  for (const b of boxes) {
    const n = findNode(root, b.id)!, c = colorOf(b), isRoot = b.depth === 0, shape = n.shape ?? "round";
    if (shape === "line" && !isRoot) out.push(`<path d="M${b.x} ${b.y + b.h}H${b.x + b.w}" stroke="${c}" stroke-width="2"/>`);
    else {
      const rx = shape === "rect" ? 4 : b.h / 2;
      out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${rx}" fill="${isRoot ? c : "#fff"}" stroke="${c}" stroke-width="2"/>`);
      if (n.color && !isRoot) out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${rx}" fill="${c}" fill-opacity=".2"/>`);
    }
    const label = [n.icon, n.text || "…", n.note ? "📝" : "", n.link ? "🔗" : ""].filter(Boolean).join(" ");
    out.push(`<text x="${b.x + b.w / 2}" y="${b.y + b.h / 2}" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="${isRoot ? 600 : 400}" fill="${isRoot && shape !== "line" ? "#fff" : "#1d2330"}">${esc(label)}</text>`);
  }
  for (const { s, g } of sums) {
    const l = g.label;
    out.push(`<path d="${summaryD(g)}" fill="none" stroke="#6b7385" stroke-width="2"/>`);
    out.push(`<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${l.h / 2}" fill="#fff" stroke="#6b7385" stroke-width="2" stroke-dasharray="6 4"/>`);
    out.push(`<text x="${l.x + l.w / 2}" y="${l.y + l.h / 2}" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#1d2330">${esc(s.text || "…")}</text>`);
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">` +
    `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#6b7385"/></marker></defs>` +
    `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/>${out.join("")}</svg>`;
  return { svg, w, h };
}

/** Rasterise an SVG on a white canvas (browser only). Scale is capped so the longest side stays under 8192px. */
export async function rasterize(m: { svg: string; w: number; h: number }, type: "image/png" | "image/jpeg", scale = 2) {
  const k = Math.min(scale, 8192 / Math.max(m.w, m.h));
  const url = URL.createObjectURL(new Blob([m.svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error("the map could not be rendered"));
      img.src = url;
    });
    const c = document.createElement("canvas");
    c.width = Math.ceil(m.w * k);
    c.height = Math.ceil(m.h * k);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.92));
    if (!blob) throw new Error("export failed (the map may be too large)");
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ponytail: the PDF is a single page holding a JPEG of the map, so text is not selectable; swap in a vector PDF writer if that matters.
/** One-page PDF of `pw`×`ph` points showing a `iw`×`ih` JPEG. */
export function pdfFromJpeg(jpg: Uint8Array, iw: number, ih: number, pw: number, ph: number) {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const put = (b: string | Uint8Array) => {
    const u = typeof b === "string" ? enc.encode(b) : b;
    parts.push(u);
    len += u.length;
  };
  const obj = (n: number, dict: string, stream?: Uint8Array) => {
    offsets[n] = len;
    put(`${n} 0 obj\n${dict}`);
    if (stream) (put("\nstream\n"), put(stream), put("\nendstream"));
    put("\nendobj\n");
  };
  const page = enc.encode(`q ${pw} 0 0 ${ph} 0 0 cm /Im Do Q`);
  put("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im 5 0 R >> >> /Contents 4 0 R >>`);
  obj(4, `<< /Length ${page.length} >>`, page);
  obj(5, `<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
  const xref = len;
  put(
    "xref\n0 6\n0000000000 65535 f \n" +
      [1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, "0")} 00000 n \n`).join("") +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  const out = new Uint8Array(len);
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
}

export async function mapToPng(m: ReturnType<typeof mapSvg>) {
  return (await rasterize(m, "image/png")).bytes;
}

export async function mapToPdf(m: ReturnType<typeof mapSvg>) {
  const j = await rasterize(m, "image/jpeg");
  const k = Math.min(1, 14400 / Math.max(m.w, m.h)); // PDF page size limit
  return pdfFromJpeg(j.bytes, j.w, j.h, Math.ceil(m.w * k), Math.ceil(m.h * k));
}
