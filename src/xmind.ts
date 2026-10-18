import { Node, Rel, Summary, parentOf } from "./model";
import { MARKER_OF_ICON, fromMarkers, lostMarkers, progressMarker } from "./task";
import { boundTopics, layoutOf, noteStructure, resolveTopicLinks, sheetsFromXml, topicHref } from "./xmindxml";
import { hex } from "./textstyle";
import { Report } from "./importreport";

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

export function zip(files: Record<string, string | Uint8Array>): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameB = enc.encode(name), data = typeof text === "string" ? enc.encode(text) : text, crc = crc32(data);
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
  markers?: { markerId: string }[];
  style?: { id?: string; properties?: Record<string, string> };
  children?: { attached?: XTopic[]; detached?: XTopic[]; summary?: XTopic[] };
  position?: { x?: number; y?: number };
  image?: { src?: string; width?: number; height?: number };
  summaries?: { range?: string; topicId?: string }[]; boundaries?: { id?: string; range?: string; title?: string }[]; labels?: unknown[];
  notes?: { plain?: { content?: string }; html?: unknown };
};

const markersOf = (n: Node) => [
  ...(n.icon && MARKER_OF_ICON[n.icon] ? [{ markerId: MARKER_OF_ICON[n.icon] }] : []),
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
    ...(n.color ? { "svg:fill": n.color } : {}),
  };
  return Object.keys(properties).length ? { id: crypto.randomUUID(), properties } : undefined;
};

/** What writing a document gathers along the way: the topic ids it holds, the summaries by parent topic, and the picture files for the zip. */
type Out = { known: Set<string>; sums: Map<string, Summary[]>; bounds: Map<string, string[]>; files: Record<string, Uint8Array> };

/** A topic's picture as a zip resource (its data URL decoded), or undefined if it is not one we can write. */
function pictureOf(n: Node, out: Out): XTopic["image"] {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(n.image?.src ?? ""), ext = m && Object.keys(MIME).find((k) => MIME[k] === m[1]);
  if (!n.image || !m || !ext) return undefined;
  const path = `resources/${n.id}.${ext}`;
  out.files[path] = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return { src: `xap:${path}`, width: n.image.w, height: n.image.h };
}

/** `known` holds every topic id in the file: a link to another topic is only written if its target is there. */
const toX = (n: Node, out: Out): XTopic => {
  const attached = n.children.filter((c) => !c.float), floating = n.children.filter((c) => c.float);
  const summaries = (out.sums.get(n.id) ?? []).flatMap((sm) => {
    const i = attached.findIndex((c) => c.id === sm.from), j = attached.findIndex((c) => c.id === sm.to);
    return i < 0 || j < 0 ? [] : [{ range: `(${Math.min(i, j)},${Math.max(i, j)})`, topicId: crypto.randomUUID(), text: sm.text }];
  });
  const image = pictureOf(n, out);
  const ranges = out.bounds.get(n.id) ?? [];
  return {
    id: n.id,
    class: "topic",
    title: n.text,
    // XMind has one href per topic: an outside link wins over a link to another topic.
    ...(n.link ? { href: n.link } : n.topicLink && out.known.has(n.topicLink) ? { href: `xmind:#${n.topicLink}` } : {}),
    ...(markersOf(n).length ? { markers: markersOf(n) } : {}),
    ...(styleOf(n) ? { style: styleOf(n) } : {}),
    ...(image ? { image } : {}),
    ...(n.note ? { notes: { plain: { content: n.note } } } : {}),
    ...(n.collapsed && n.children.length ? { branch: "folded" } : {}),
    ...(ranges.length ? { boundaries: ranges.map((range) => ({ id: crypto.randomUUID(), class: "boundary", range })) } : {}),
    ...(summaries.length ? { summaries: summaries.map(({ text: _text, ...sm }) => ({ id: crypto.randomUUID(), ...sm })) } : {}),
    ...(n.children.length
      ? {
          children: {
            ...(attached.length ? { attached: attached.map((c) => toX(c, out)) } : {}),
            ...(floating.length ? { detached: floating.map((c) => ({ ...toX(c, out), position: { x: c.float!.x, y: c.float!.y } })) } : {}),
            ...(summaries.length ? { summary: summaries.map((sm) => ({ id: sm.topicId, class: "topic", title: sm.text })) } : {}),
          },
        }
      : {}),
  };
};

const HANDLED_STYLE = new Set(["fo:font-weight", "fo:font-style", "fo:text-decoration", "fo:color", "svg:fill"]);

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
const DATA_URL_BUDGET = 700_000; // the same ceiling a picture added in the editor is held to

const base64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** An SVG without width and height is sized by its viewBox, or a default. */
const svgSize = (text: string) => {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const num = (name: string) => Number(new RegExp(`\\s${name}\\s*=\\s*["']([\\d.]+)(?:px)?["']`, "i").exec(tag)?.[1]);
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  return { w: num("width") || Number(vb?.[1]) || 100, h: num("height") || Number(vb?.[2]) || 100 };
};

/** Looks a topic's picture up in the zip's resources and embeds it; undefined (and counted in the report) when it cannot be. */
type Pictures = (t: XTopic) => Node["image"] | undefined;

const picturesOf = (files: Map<string, Uint8Array>, rep: Report): Pictures => (t) => {
  if (!t.image) return undefined;
  const path = (t.image.src ?? "").replace(/^xap:/, ""), bytes = files.get(path), ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "";
  const mime = MIME[ext];
  if (!bytes || !mime) return void rep.add("images dropped");
  const src = `data:${mime};base64,${base64(bytes)}`;
  if (src.length > DATA_URL_BUDGET) return void rep.add("images too large to embed dropped");
  const size = ext === "svg" ? svgSize(dec.decode(bytes)) : { w: t.image.width, h: t.image.height };
  return { src, w: Math.max(1, Math.round(size.w || 100)), h: Math.max(1, Math.round(size.h || 100)) };
};

/** Summaries and boundaries found while reading topics; both live on the root of a sheet. */
type Acc = { sums: Summary[]; bounds: string[] };

/** "(2,4)" -> [2, 4]: the first and last summarised child. */
const rangeOf = (r: string | undefined) => {
  const m = /^\((\d+),(\d+)\)$/.exec(r ?? "");
  return m ? ([Number(m[1]), Number(m[2])] as const) : null;
};

const fromX = (t: XTopic, ids: Map<string, string>, rep: Report, acc: Acc, pic: Pictures, isRoot = false): Node => {
  const children = (t.children?.attached ?? []).map((c) => fromX(c, ids, rep, acc, pic));
  // Floating topics hang off the central topic; elsewhere XMind has none and neither do we.
  const floating = t.children?.detached ?? [];
  if (isRoot) children.push(...floating.map((f) => ({ ...fromX(f, ids, rep, acc, pic), float: { x: f.position?.x ?? 0, y: f.position?.y ?? 0 } })));
  else rep.add("floating topics dropped", floating.length);
  for (const sm of t.summaries ?? []) {
    const r = rangeOf(sm.range), from = r && children[r[0]], to = r && children[r[1]];
    const title = (t.children?.summary ?? []).find((x) => x.id === sm.topicId)?.title;
    if (from && to && title != null) acc.sums.push({ id: crypto.randomUUID(), from: from.id, to: to.id, text: title });
    else rep.add("summaries dropped");
  }
  const markerIds = (t.markers ?? []).map((m) => m.markerId); // other marker kinds (flags, symbols…) are dropped
  const sp = t.style?.properties ?? {};
  rep.add("markers with no counterpart dropped", lostMarkers(markerIds));
  rep.add("labels dropped", t.labels?.length ?? 0);
  const image = pic(t);
  rep.add("rich-text notes flattened to plain text", t.notes?.html ? 1 : 0);
  rep.add("topic styles other than bold, italic, strike, text colour and fill dropped", Object.keys(sp).some((k) => !HANDLED_STYLE.has(k)) ? 1 : 0);
  const color = hex(sp["fo:color"]?.slice(0, 7)); // XMind may append an alpha pair
  const fill = hex(sp["svg:fill"]?.slice(0, 7));
  const to = topicHref(t.href);
  const node: Node = {
    id: crypto.randomUUID(),
    text: t.title ?? "",
    children,
    ...(to ? { topicLink: to } : t.href ? { link: t.href } : {}),
    ...fromMarkers(markerIds),
    ...(sp["fo:font-weight"] === "bold" || Number(sp["fo:font-weight"]) >= 600 ? { bold: true } : {}),
    ...(sp["fo:font-style"] === "italic" ? { italic: true } : {}),
    ...(sp["fo:text-decoration"]?.includes("line-through") ? { strike: true } : {}),
    ...(color ? { textColor: color } : {}),
    ...(fill ? { color: fill } : {}),
    ...(image ? { image } : {}),
    ...(t.notes?.plain?.content ? { note: t.notes.plain.content } : {}),
    ...(t.branch === "folded" && children.length ? { collapsed: true } : {}),
  };
  acc.bounds.push(...boundTopics(node, t.boundaries ?? [], rep));
  ids.set(t.id, node.id); // lets links between topics find their new targets
  return node;
};

type XSheet = { id: string; class?: string; title?: string; rootTopic?: XTopic; relationships?: { id?: string; class?: string; end1Id?: string; end2Id?: string }[] };

const STRUCTURE: Record<NonNullable<Node["layout"]>, string> = {
  right: "org.xmind.ui.logic.right",
  map: "org.xmind.ui.map.clockwise",
  down: "org.xmind.ui.org-chart.down",
  tree: "org.xmind.ui.tree.right",
  fish: "org.xmind.ui.fishbone.rightHeaded",
  line: "org.xmind.ui.timeline.horizontal",
  left: "org.xmind.ui.logic.left",
  brace: "org.xmind.ui.brace.right",
  matrix: "org.xmind.ui.spreadsheet.column",
  up: "org.xmind.ui.org-chart.up",
  "tree-left": "org.xmind.ui.tree.left",
  "brace-left": "org.xmind.ui.brace.left",
  "fish-left": "org.xmind.ui.fishbone.leftHeaded",
  "map-ccw": "org.xmind.ui.map.anticlockwise",
};

const toSheet = (root: Node, i: number, out: Out): XSheet => {
  const rels = (root.rels ?? []).filter((r) => out.known.has(r.from) && out.known.has(r.to));
  return {
    id: crypto.randomUUID(),
    class: "sheet",
    title: root.title || root.text || `Sheet ${i + 1}`,
    rootTopic: {
      ...toX(root, out),
      structureClass: STRUCTURE[root.layout ?? "right"],
    },
    ...(rels.length ? { relationships: rels.map((r) => ({ id: r.id, class: "relationship", end1Id: r.from, end2Id: r.to })) } : {}),
  };
};

const idsOf = (n: Node): string[] => [n.id, ...n.children.flatMap(idsOf)];

/** One XMind sheet per root topic. */
export function exportXmind(roots: Node | Node[]): Uint8Array {
  const list = Array.isArray(roots) ? roots : [roots];
  const sums = new Map<string, Summary[]>();
  for (const r of list) for (const sm of r.summaries ?? []) {
    const parent = parentOf(r, sm.from);
    if (parent) sums.set(parent.id, [...(sums.get(parent.id) ?? []), sm]);
  }
  const bounds = new Map<string, string[]>(); // parent topic -> the ranges its boundaries cover
  for (const r of list) for (const id of r.bounds ?? []) {
    const parent = parentOf(r, id), at = parent?.children.filter((c) => !c.float).findIndex((c) => c.id === id);
    const [on, range] = parent ? [parent.id, `(${at},${at})`] : [r.id, "master"]; // the central topic has no parent: it is wrapped as a whole
    if (parent ? at! < 0 : id !== r.id) continue;
    bounds.set(on, [...(bounds.get(on) ?? []), range]);
  }
  const out: Out = { known: new Set(list.flatMap(idsOf)), sums, bounds, files: {} };
  const content = JSON.stringify(list.map((r, i) => toSheet(r, i, out))); // fills out.files with the pictures
  return zip({
    "content.json": content,
    "metadata.json": "{}",
    "manifest.json": JSON.stringify({ "file-entries": { "content.json": {}, "metadata.json": {}, ...Object.fromEntries(Object.keys(out.files).map((f) => [f, {}])) } }),
    ...out.files,
  });
}

/** Imports every sheet as a root topic (sheet title kept) and lists what could not be carried over. */
export async function importXmindReport(bytes: Uint8Array): Promise<{ roots: Node[]; lost: string[] }> {
  const rep = new Report();
  const files = await unzip(bytes);
  const content = files.get("content.json"); // XMind Zen and later; it wins over the placeholder content.xml those files also carry
  if (!content) {
    const xml = files.get("content.xml"); // XMind 8 and earlier
    if (!xml) throw new Error("no content.json or content.xml (not an XMind file)");
    return { roots: sheetsFromXml(dec.decode(xml), rep), lost: rep.lines() };
  }
  const ids = new Map<string, string>();
  const pictures = picturesOf(files, rep);
  const pendingRels: [Node, NonNullable<XSheet["relationships"]>][] = []; // resolved once every topic id is known
  const roots = (JSON.parse(dec.decode(content)) as XSheet[])
    .filter((sh) => sh.rootTopic)
    .map((sh) => {
      const acc: Acc = { sums: [], bounds: [] };
      const root = fromX(sh.rootTopic!, ids, rep, acc, pictures, true);
      if (acc.sums.length) root.summaries = acc.sums;
      if (acc.bounds.length) root.bounds = acc.bounds;
      pendingRels.push([root, sh.relationships ?? []]);
      const sc = sh.rootTopic!.structureClass ?? "";
      const layout = layoutOf(sc); // matrix, timeline… stay the default logic chart
      if (layout) root.layout = layout;
      noteStructure(sc, layout, rep);
      if (sh.title) root.title = sh.title;
      return root;
    });
  if (!roots.length) throw new Error("no sheet found");
  resolveTopicLinks(roots, ids);
  for (const [root, list] of pendingRels) {
    const rels: Rel[] = [];
    for (const r of list) {
      const from = ids.get(r.end1Id ?? ""), to = ids.get(r.end2Id ?? "");
      if (from && to) rels.push({ id: crypto.randomUUID(), from, to });
      else rep.add("relationships dropped");
    }
    if (rels.length) root.rels = rels;
  }
  return { roots, lost: rep.lines() };
}

export const importXmindSheets = async (bytes: Uint8Array): Promise<Node[]> => (await importXmindReport(bytes)).roots;

/** First sheet only. */
export const importXmind = async (bytes: Uint8Array): Promise<Node> => (await importXmindSheets(bytes))[0];
