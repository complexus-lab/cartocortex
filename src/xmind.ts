import { Node } from "./model";
import { XM_PROGRESS, progressMarker } from "./task";
import { hex } from "./textstyle";

// .xmind = zip containing content.json (modern format, XMind 8+/Zen). Written uncompressed ("stored");
// read accepts stored and deflate. Legacy XML-only files are not supported.

const enc = new TextEncoder();
const dec = new TextDecoder();

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files: Record<string, string>): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameB = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(12, 33, true); // dos date: 1980-01-01
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameB.length, true);
    local.push(new Uint8Array(lh.buffer), nameB, data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(14, 33, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  const n = Object.keys(files).length;
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, n, true); end.setUint16(10, n, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
}

const inflate = async (b: Uint8Array) =>
  new Uint8Array(await new Response(new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());

async function unzip(b: Uint8Array): Promise<Map<string, Uint8Array>> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = b.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("not a zip file");
  const count = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const lo = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
    const raw = b.subarray(start, start + csize);
    if (method !== 0 && method !== 8) throw new Error(`unsupported zip method ${method}`);
    out.set(name, method === 8 ? await inflate(raw) : raw);
    p += 46 + nlen + elen + clen;
  }
  return out;
}

type XTopic = {
  id: string; class?: string; title?: string; href?: string; branch?: string; structureClass?: string;
  notes?: { plain?: { content?: string } };
  markers?: { markerId: string }[];
  style?: { id?: string; properties?: Record<string, string> };
  children?: { attached?: XTopic[] };
};

const markersOf = (n: Node) => [
  ...(n.priority ? [{ markerId: `priority-${n.priority}` }] : []),
  ...(n.progress != null ? [{ markerId: progressMarker(n.progress) }] : []),
];

/** XMind keeps topic text style in `style.properties` (fo:* keys). */
const styleOf = (n: Node): XTopic["style"] => {
  const properties: Record<string, string> = {
    ...(n.bold ? { "fo:font-weight": "bold" } : {}),
    ...(n.italic ? { "fo:font-style": "italic" } : {}),
    ...(n.strike ? { "fo:text-decoration": "line-through" } : {}),
    ...(n.textColor ? { "fo:color": n.textColor } : {}),
  };
  return Object.keys(properties).length ? { id: crypto.randomUUID(), properties } : undefined;
};

const toX = (n: Node): XTopic => ({
  id: n.id,
  class: "topic",
  title: n.text,
  ...(n.link ? { href: n.link } : {}),
  ...(markersOf(n).length ? { markers: markersOf(n) } : {}),
  ...(styleOf(n) ? { style: styleOf(n) } : {}),
  ...(n.note ? { notes: { plain: { content: n.note } } } : {}),
  ...(n.collapsed && n.children.length ? { branch: "folded" } : {}),
  ...(n.children.length ? { children: { attached: n.children.map(toX) } } : {}),
});

const fromX = (t: XTopic): Node => {
  const children = (t.children?.attached ?? []).map(fromX);
  const ids = (t.markers ?? []).map((m) => m.markerId); // other marker kinds (flags, symbols…) are dropped
  const prio = ids.map((id) => /^priority-(\d)$/.exec(id)?.[1]).find(Boolean);
  const prog = ids.find((id) => id in XM_PROGRESS);
  const sp = t.style?.properties ?? {};
  const color = hex(sp["fo:color"]?.slice(0, 7)); // XMind may append an alpha pair
  return {
    id: crypto.randomUUID(),
    text: t.title ?? "",
    children,
    ...(t.href ? { link: t.href } : {}),
    ...(prio ? { priority: Number(prio) } : {}),
    ...(prog ? { progress: XM_PROGRESS[prog] } : {}),
    ...(sp["fo:font-weight"] === "bold" ? { bold: true } : {}),
    ...(sp["fo:font-style"] === "italic" ? { italic: true } : {}),
    ...(sp["fo:text-decoration"]?.includes("line-through") ? { strike: true } : {}),
    ...(color ? { textColor: color } : {}),
    ...(t.notes?.plain?.content ? { note: t.notes.plain.content } : {}),
    ...(t.branch === "folded" && children.length ? { collapsed: true } : {}),
  };
};

type XSheet = { id: string; class?: string; title?: string; rootTopic?: XTopic };

const STRUCTURE: Record<NonNullable<Node["layout"]>, string> = {
  right: "org.xmind.ui.logic.right",
  map: "org.xmind.ui.map.clockwise",
  down: "org.xmind.ui.org-chart.down",
  tree: "org.xmind.ui.tree.right",
  fish: "org.xmind.ui.fishbone.rightHeaded",
};

const toSheet = (root: Node, i: number): XSheet => ({
  id: crypto.randomUUID(),
  class: "sheet",
  title: root.title || root.text || `Sheet ${i + 1}`,
  rootTopic: {
    ...toX(root),
    structureClass: STRUCTURE[root.layout ?? "right"],
  },
});

/** One XMind sheet per root topic. */
export function exportXmind(roots: Node | Node[]): Uint8Array {
  return zip({
    "content.json": JSON.stringify((Array.isArray(roots) ? roots : [roots]).map(toSheet)),
    "metadata.json": "{}",
    "manifest.json": JSON.stringify({ "file-entries": { "content.json": {}, "metadata.json": {} } }),
  });
}

/** Imports every sheet as a root topic (sheet title kept). Markers, styles and relationships are dropped. */
export async function importXmindSheets(bytes: Uint8Array): Promise<Node[]> {
  const content = (await unzip(bytes)).get("content.json");
  if (!content) throw new Error("no content.json (legacy .xmind files are not supported)");
  const roots = (JSON.parse(dec.decode(content)) as XSheet[])
    .filter((sh) => sh.rootTopic)
    .map((sh) => {
      const root = fromX(sh.rootTopic!);
      const sc = sh.rootTopic!.structureClass ?? "";
      // Other structures (matrix, timeline…) come in as the default logic chart. Fishbone keeps its head on the right.
      if (sc.includes("fishbone")) root.layout = "fish";
      else if (sc.includes("org-chart")) root.layout = "down";
      else if (sc.includes("tree")) root.layout = "tree";
      else if (sc.includes("map")) root.layout = "map";
      if (sh.title) root.title = sh.title;
      return root;
    });
  if (!roots.length) throw new Error("no sheet found");
  return roots;
}

/** First sheet only. */
export const importXmind = async (bytes: Uint8Array): Promise<Node> => (await importXmindSheets(bytes))[0];
