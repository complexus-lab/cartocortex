import { Node } from "./model";
import { decode, parseXml, resolveTopicLinks, XNode } from "./xmindxml";

// Reader and writer for the FreeMind / Freeplane .mm format: plain XML, or the gzip FreeMind also writes
// (magic bytes 1f 8b). Reading reuses the strict parser from the old .xmind reader (no DOCTYPE, predefined
// entities only). Writing is deliberately lossy: one root node per sheet, only the properties FreeMind
// itself knows, and nothing but plain lines of text where FreeMind allows rich HTML.

const kid = (n: XNode, name: string) => n.children.find((c) => c.name === name);

/** Attribute lookup, case-insensitive: files in the wild mix TEXT with text, COLOR with color. */
function attr(n: XNode, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(n.attrs)) if (k.toLowerCase() === lower) return v;
  return undefined;
}

/** "#rrggbb" from FreeMind's colour attributes, which sometimes drop the #; anything else is dropped. */
const hexColor = (v: string | undefined): string | undefined => {
  const s = v?.trim();
  return s ? (/^#[0-9a-f]{6}$/i.test(s) ? s : /^[0-9a-f]{6}$/i.test(s) ? "#" + s : undefined) : undefined;
};

/** FreeMind's progress icons and the percentage each one stands for. */
const PROGRESS: Record<string, number> = { "0%": 0, "25%": 25, "50%": 50, "75%": 75, "100%": 100 };

/** The FreeMind progress icon closest to `pct`. */
const progressIcon = (pct: number) => Object.keys(PROGRESS).reduce((best, k) => (Math.abs(PROGRESS[k] - pct) < Math.abs(PROGRESS[best] - pct) ? k : best), "0%");

/** Raw `<richcontent>` blocks in source order: the parsed tree keeps the text but not where the `<br/>`s were. */
const richSlices = (src: string): string[] => {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const s = src.indexOf("<richcontent", i);
    if (s < 0) return out;
    const e = src.indexOf("</richcontent>", s);
    if (e < 0) return out;
    out.push(src.slice(s, e));
    i = e + 14;
  }
};

/** Every node called `name` in document order. */
const nodesNamed = (n: XNode, name: string, out: XNode[] = []): XNode[] => {
  if (n.name === name) out.push(n);
  n.children.forEach((c) => nodesNamed(c, name, out));
  return out;
};

/** richcontent node -> raw source slice, zipped in document order; empty map when the counts do not match up. */
const rawSlices = (src: string, root: XNode): Map<XNode, string> => {
  const m = new Map<XNode, string>();
  const slices = richSlices(src);
  const nodes = nodesNamed(root, "richcontent");
  if (slices.length === nodes.length) nodes.forEach((n, i) => m.set(n, slices[i]));
  return m;
};

/** Lines of text in a raw richcontent block: a new line per `<p>` and per `<br/>`, tags dropped, entities decoded. */
const htmlOf = (raw: string): string => {
  let out = "";
  let i = 0;
  for (;;) {
    const lt = raw.indexOf("<", i);
    if (lt < 0) {
      out += decode(raw.slice(i));
      break;
    }
    if (lt > i) out += decode(raw.slice(i, lt));
    const gt = raw.indexOf(">", lt);
    if (gt < 0) break;
    const name = (/^([a-z0-9]+)/i.exec(raw.slice(lt + 1, gt))?.[1] ?? "").toLowerCase();
    if (name === "br" || name === "p" || name === "li") out += "\n";
    i = gt + 1;
  }
  return out.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
};

/** richcontent text from the parsed node alone (no raw slice): the text survives, the line breaks may not. */
const plainOf = (n: XNode): string => {
  const own = n.text.trim();
  const kids = n.children.map(plainOf).filter(Boolean);
  return kids.length ? (own ? [own, ...kids].join("\n") : kids.join("\n")) : own;
};

/** The text of a richcontent block: from the raw slice when we have one (keeping text and `<br/>` order), else from the tree. */
const htmlText = (n: XNode, raw: Map<XNode, string>): string => {
  const slice = raw.get(n);
  return slice === undefined ? plainOf(n) : htmlOf(slice);
};

/** One FreeMind node -> one Cartocortex topic. */
function nodeFromXml(x: XNode, ids: Map<string, string>, raw: Map<XNode, string>): Node {
  const children = x.children.filter((c) => c.name === "node").map((c) => nodeFromXml(c, ids, raw));
  const nodeRich = x.children.find((c) => c.name === "richcontent" && attr(c, "TYPE")?.toUpperCase() === "NODE");
  const noteRich = x.children.find((c) => c.name === "richcontent" && attr(c, "TYPE")?.toUpperCase() === "NOTE");
  const noteHook = x.children.find((c) => c.name === "hook" && attr(c, "NAME") === "map/Note"); // FreeMind 0.9
  const icons = x.children.filter((c) => c.name === "icon").map((c) => attr(c, "BUILTIN") ?? "");
  const prio = icons.map((b) => /^full-(\d+)$/.exec(b)?.[1]).find(Boolean);
  const prog = icons.map((b) => PROGRESS[b]).find((p) => p !== undefined);
  const text = nodeRich ? htmlText(nodeRich, raw) : attr(x, "TEXT") ?? "";
  const note = noteRich ? htmlText(noteRich, raw) : noteHook ? (kid(noteHook, "text")?.text ?? "").trim() : "";
  const fill = hexColor(attr(x, "BACKGROUND_COLOR"));
  const ink = hexColor(attr(x, "COLOR"));
  const font = kid(x, "font");
  const dest = x.children.find((c) => c.name === "arrowlink");
  const to = dest ? attr(dest, "DESTINATION") : undefined;
  const link = attr(x, "LINK");
  const node: Node = {
    id: crypto.randomUUID(),
    text,
    children,
    ...(note ? { note } : {}),
    ...(link ? { link } : {}),
    ...(to ? { topicLink: to } : {}),
    ...(fill ? { color: fill } : {}),
    ...(ink ? { textColor: ink } : {}),
    ...(font && attr(font, "BOLD")?.toLowerCase() === "true" ? { bold: true } : {}),
    ...(font && attr(font, "ITALIC")?.toLowerCase() === "true" ? { italic: true } : {}),
    ...(children.length && attr(x, "FOLDED")?.toLowerCase() === "true" ? { collapsed: true } : {}),
    ...(prio ? { priority: Math.min(9, Math.max(1, Number(prio))) } : {}),
    ...(prog !== undefined ? { progress: prog } : {}),
  };
  const id = attr(x, "ID");
  if (id) ids.set(id, node.id); // for arrowlink: FreeMind's id -> ours
  return node;
}

/** The root topics of a .mm map. Left-side first-level topics open as a one-sided (logic left) or two-sided (map) chart. */
export function fromFreemind(src: string): Node[] {
  const root = parseXml(src); // throws on DOCTYPE, on anything but plain XML
  const raw = rawSlices(src, root);
  const ids = new Map<string, string>();
  const roots = root.children.filter((c) => c.name === "node").map((c) => {
    const sides = c.children.filter((k) => k.name === "node").map((k) => (attr(k, "POSITION") ?? "").toLowerCase() === "left");
    const node = nodeFromXml(c, ids, raw);
    const lefts = sides.filter(Boolean).length;
    if (!lefts) return node;
    node.layout = lefts === sides.length ? "left" : "map";
    // The two-sided map grows its first half to the right, so right-side topics come first.
    node.children = node.children.filter((_, i) => !sides[i]).concat(node.children.filter((_, i) => sides[i]));
    return node;
  });
  if (!roots.length) throw new Error("no topic found in this mind map");
  resolveTopicLinks(roots, ids); // arrowlink destinations -> our topic ids; links to missing topics are dropped
  return roots;
}

/** A .mm file: plain XML, or gzip (magic bytes 1f 8b). */
export async function fromFreemindBytes(bytes: Uint8Array): Promise<Node[]> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return fromFreemind(new TextDecoder().decode(bytes));
  const text = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return fromFreemind(text);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

const hex = (c: string | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : undefined);

/** FreeMind keeps line breaks in a richcontent block, one `<p>` per line. */
const richBlock = (type: string, lines: string[]): string =>
  `<richcontent TYPE="${type}"><html><head/><body>${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</body></html></richcontent>`;

/** One Cartocortex topic -> one FreeMind node. `side` is the POSITION of a first-level topic; `childSides` of its children. */
function nodeToXml(n: Node, fm: Map<string, string>, side?: "left" | "right", childSides?: Array<"left" | "right" | undefined>): string {
  const lines = n.text.split("\n");
  const attrs =
    ` ID="${fm.get(n.id)}"` +
    ` TEXT="${esc(lines[0])}"` +
    (side ? ` POSITION="${side}"` : "") +
    (hex(n.textColor) ? ` COLOR="${n.textColor}"` : "") +
    (hex(n.color) ? ` BACKGROUND_COLOR="${n.color}"` : "") +
    (n.link ? ` LINK="${esc(n.link)}"` : "") +
    (n.collapsed && n.children.length ? ' FOLDED="true"' : "");
  const inner: string[] = [];
  if (n.bold || n.italic) inner.push(`<font${n.bold ? ' BOLD="true"' : ""}${n.italic ? ' ITALIC="true"' : ""}/>`);
  if (n.priority) inner.push(`<icon BUILTIN="full-${Math.min(9, Math.max(1, Math.round(n.priority)))}"/>`);
  if (n.progress != null) inner.push(`<icon BUILTIN="${progressIcon(n.progress)}"/>`);
  if (lines.length > 1) inner.push(richBlock("NODE", lines)); // TEXT carries the first line for plain-text readers
  if (n.note) inner.push(richBlock("NOTE", n.note.split("\n")));
  const to = n.topicLink ? fm.get(n.topicLink) : undefined;
  if (to) inner.push(`<arrowlink DESTINATION="${to}"/>`);
  const kids = n.children.map((c, i) => nodeToXml(c, fm, childSides?.[i])).join("");
  return `<node${attrs}>${inner.join("")}${kids}</node>`;
}

/** Where a first-level topic sits, from the root's layout: everything left, or the first half right and the rest left. */
const childSides = (root: Node): Array<"left" | "right" | undefined> => {
  if (root.layout === "left") return root.children.map(() => "left" as const);
  if (root.layout === "map") {
    const cut = Math.ceil(root.children.length / 2);
    return root.children.map((_, i) => (i < cut ? ("right" as const) : ("left" as const)));
  }
  return root.children.map(() => undefined);
};

/** A .mm map from Cartocortex sheets: one root node per sheet, so extra sheets may not show in FreeMind itself. */
export function toFreemind(roots: Node[]): string {
  const fm = new Map<string, string>();
  const claim = (n: Node) => (fm.set(n.id, "ID_" + crypto.randomUUID()), n.children.forEach(claim));
  roots.forEach(claim); // every id first: an arrowlink may point at a topic that comes later
  const nodes = roots.map((r) => nodeToXml(r, fm, undefined, childSides(r))).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">\n${nodes}\n</map>\n`;
}
