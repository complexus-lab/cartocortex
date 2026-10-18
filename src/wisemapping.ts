import { Node } from "./model";
import { parseXml, XNode } from "./xmindxml";

// Reader and writer for WiseMapping's .wxml format: plain XML, the current "tango" dialect and the
// older "pela" files. Reading reuses the strict parser from the old .xmind files (no DOCTYPE,
// predefined entities only). Writing is deliberately lossy: one map (the first sheet), with the
// sheets after it as WiseMapping's free branches, and only what the tango schema knows.

const kid = (n: XNode | undefined, name: string) => n?.children.find((c) => c.name === name);
const kids = (n: XNode | undefined, name: string) => (n?.children ?? []).filter((c) => c.name === name);

/** Attribute lookup, case-insensitive: files in the wild mix SrcTopicId with srcTopicId. */
function attr(n: XNode | undefined, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(n?.attrs ?? {})) if (k.toLowerCase() === lower) return v;
  return undefined;
}

/** "#rrggbb" from a WiseMapping colour, which sometimes drops the #; anything else is dropped. */
const hexColor = (v: string | undefined): string | undefined => {
  const s = v?.trim();
  return s ? (/^#[0-9a-f]{6}$/i.test(s) ? s : /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toLowerCase() : undefined) : undefined;
};

/** The percent-escapes of the old pela notes, read the way WiseMapping reads them: %xx and %uxxxx. */
const unescapeWise = (s: string) =>
  s.replace(/%u([0-9a-f]{4})|%([0-9a-f]{2})/gi, (m, u: string, h: string) => String.fromCharCode(parseInt(u || h, 16)));

/** A "x,y" position; undefined when the attribute is missing or corrupt. */
const posOf = (t: XNode): { x: number; y: number } | undefined => {
  const p = (attr(t, "position") ?? "").split(",");
  const x = Number(p[0]), y = Number(p[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
};

/** A topic's child topics, in their `order`; a missing order keeps the file's own order, as in WiseMapping. */
const ordered = (t: XNode): XNode[] => kids(t, "topic").sort((a, b) => (Number(attr(a, "order")) || 0) - (Number(attr(b, "order")) || 0));

/** A WiseMapping shape -> ours; the "elipse" spelling and the default are the app's own round box. */
const shapeOf = (v: string | undefined): Node["shape"] | undefined => {
  const s = (v ?? "").replace("rectagle", "rectangle"); // the typo WiseMapping itself reads around
  return s === "line" ? "line" : s === "rectangle" || s === "rounded rectangle" ? "rect" : undefined;
};

/** One WiseMapping topic -> one Cartocortex topic. */
function topicFromXml(t: XNode, ids: Map<string, string>): Node {
  const children = ordered(t).map((c) => topicFromXml(c, ids));
  const textEl = kid(t, "text");
  const text = textEl ? textEl.text : attr(t, "text") ?? ""; // a multi-line text is a <text> block, not the attribute
  const noteEl = kid(t, "note");
  const noteAttr = attr(noteEl, "text");
  const note = noteEl ? (noteAttr ? unescapeWise(noteAttr) : noteEl.text) : ""; // the old attribute is percent-encoded
  const link = attr(kid(t, "link"), "url");
  const icon = kids(t, "eicon").map((e) => attr(e, "id")).find(Boolean); // the old <icon> has no emoji we could read
  const font = (attr(t, "fontStyle") ?? "").split(";");
  const fill = hexColor(attr(t, "bgColor"));
  const ink = hexColor(font[2]);
  const shape = shapeOf(attr(t, "shape"));
  const node: Node = {
    id: crypto.randomUUID(),
    text,
    children,
    ...(note.trim() ? { note: note.trim() } : {}),
    ...(link ? { link } : {}),
    ...(icon ? { icon } : {}),
    ...(fill ? { color: fill } : {}),
    ...(ink ? { textColor: ink } : {}),
    ...(font[3] === "bold" ? { bold: true } : {}),
    ...(font[4] === "italic" ? { italic: true } : {}),
    ...(shape ? { shape } : {}),
    ...(attr(t, "shrink") === "true" && children.length ? { collapsed: true } : {}),
  };
  const id = attr(t, "id");
  if (id) ids.set(id, node.id); // for relationships: WiseMapping's id -> ours
  return node;
}

/** The root topic of a .wxml map, with the map's free branches floating beside it. */
export function fromWisemapping(src: string): Node[] {
  const map = parseXml(src); // throws on DOCTYPE, on anything but plain XML
  if (map.name !== "map") throw new Error("not a WiseMapping map");
  const ids = new Map<string, string>();
  const topics = kids(map, "topic");
  const central = topics.find((t) => attr(t, "central") !== undefined) ?? topics[0];
  if (!central) throw new Error("no topic found in this mind map");
  const node = topicFromXml(central, ids);
  if (node.collapsed) delete node.collapsed; // a shrink on the central topic: WiseMapping's own reader calls that a bug
  // The side a first-level topic sits on comes from its position: all left opens as Logic (left), both sides as a Map.
  const sides = ordered(central).map((c) => ((posOf(c)?.x ?? 0) < 0 ? -1 : 1));
  const lefts = sides.filter((s) => s < 0).length;
  if (lefts === sides.length && lefts) node.layout = "left";
  else if (lefts) {
    // A two-sided map grows its right half first, so right-side topics come first.
    node.layout = "map";
    node.children = node.children.filter((_, i) => sides[i] >= 0).concat(node.children.filter((_, i) => sides[i] < 0));
  }
  // The map's free branches: topics at map level, which open as floating topics.
  for (const t of topics) {
    if (t === central) continue;
    const n = topicFromXml(t, ids);
    const pos = posOf(t);
    n.float = { x: Math.round(pos?.x ?? 0), y: Math.round(pos?.y ?? 0) };
    node.children.push(n);
  }
  // The map's relationships, their ends remapped to our ids.
  const rels = kids(map, "relationship")
    .map((r) => ({ from: ids.get(attr(r, "srcTopicId") ?? ""), to: ids.get(attr(r, "destTopicId") ?? "") }))
    .filter((r): r is { from: string; to: string } => !!r.from && !!r.to)
    .map(({ from, to }) => ({ id: crypto.randomUUID(), from, to }));
  if (rels.length) node.rels = rels; // relationship lines live on the open sheet's root topic
  return [node];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** A CDATA block; "]]>" cannot sit inside one, so it is split the way WiseMapping writes it. */
const cdata = (s: string) => "<![CDATA[" + s.split("]]>").join("]]]]><![CDATA[>") + "]]>";

const hex = (c: string | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : undefined);

// WiseMapping's own spacing: a first-level topic sits 200 px from the centre, a deeper one 90 px from its parent.
const SPREAD = [200, 90], ROW = 50;

/** One Cartocortex topic -> one WiseMapping topic. `side` -1 grows left; `pos` is the topic's canvas position. */
function topicToXml(n: Node, wise: Map<string, string>, pos: { x: number; y: number }, order: number | undefined, side: 1 | -1, spread: number, central = false): string {
  const ink = hex(n.textColor), fill = hex(n.color);
  const attrs =
    (central ? ' central="true"' : ` position="${Math.ceil(pos.x)},${Math.ceil(pos.y)}"`) +
    ` id="${wise.get(n.id)}"` +
    (order !== undefined ? ` order="${order}"` : "") +
    (!n.text.includes("\n") && n.text ? ` text="${esc(n.text)}"` : "") +
    (n.shape === "line" ? ' shape="line"' : n.shape === "rect" ? ' shape="rectangle"' : "") +
    (n.collapsed && n.children.length ? ' shrink="true"' : "") +
    (ink || n.bold || n.italic ? ` fontStyle=";;${ink ?? ""};${n.bold ? "bold" : ""};${n.italic ? "italic" : ""};"` : "") +
    (fill ? ` bgColor="${fill}"` : "");
  const inner: string[] = [];
  if (n.text.includes("\n") && n.text) inner.push(`<text>${cdata(n.text)}</text>`);
  if (n.icon) inner.push(`<eicon id="${esc(n.icon)}"/>`);
  if (n.link) inner.push(`<link url="${esc(n.link)}"/>`);
  if (n.note) inner.push(`<note>${cdata(n.note)}</note>`);
  const attached = n.children.filter((c) => !c.float); // a sheet's floating topics are written at map level
  const cut = central && n.layout === "map" ? Math.ceil(attached.length / 2) : central && n.layout === "left" ? 0 : attached.length;
  const child = (c: Node, k: number) => {
    const s: 1 | -1 = central ? (k < cut ? 1 : -1) : side;
    const group = central ? (s > 0 ? k : k - cut) : k;
    const len = central ? (s > 0 ? cut : attached.length - cut) : attached.length;
    return topicToXml(c, wise, { x: pos.x + s * spread, y: pos.y + (group - (len - 1) / 2) * ROW }, k, s, SPREAD[1]);
  };
  return `<topic${attrs}>${inner.join("")}${attached.map(child).join("")}</topic>`;
}

/** A .wxml map from Cartocortex sheets: the first sheet is the map, the sheets after it are WiseMapping's free branches. */
export function toWisemapping(roots: Node[]): string {
  const wise = new Map<string, string>();
  let next = 0;
  const claim = (n: Node) => (wise.set(n.id, String(++next)), n.children.forEach(claim));
  roots.forEach(claim); // every id first: a relationship may point at a topic that comes later
  const parts: string[] = [];
  const free = (n: Node, x: number, y: number, k: number) => parts.push(topicToXml(n, wise, { x, y }, k, 1, SPREAD[1]));
  if (roots[0]) parts.push(topicToXml(roots[0], wise, { x: 0, y: 0 }, undefined, 1, SPREAD[0], true));
  let k = 0;
  for (const r of roots) for (const c of r.children.filter((c) => c.float)) free(c, c.float!.x, c.float!.y, k++);
  roots.slice(1).forEach((r, i) => free(r, 200, 250 * (i + 1), k++)); // the sheets after the first
  // The relationships of the open sheet, their ends remapped to WiseMapping's ids.
  const rels = (roots[0]?.rels ?? []).filter((r) => wise.has(r.from) && wise.has(r.to))
    .map((r) => `<relationship srcTopicId="${wise.get(r.from)}" destTopicId="${wise.get(r.to)}"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<map version="tango">\n${[...parts, ...rels].join("\n")}\n</map>\n`;
}
