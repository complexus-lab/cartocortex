import { Node } from "./model";
import { parseXml, XNode } from "./xmindxml";
import { unzip, zip } from "./xmind";

// Reader and writer for MindManager's .mmap format: a zip holding Document.xml (MindManager X5 and
// later), or the flat XML of the MindManager 10 for Mac builds that did not zip. Reading reuses the
// strict parser from the old .xmind files (no DOCTYPE, predefined entities only). Writing is
// deliberately lossy: one map per sheet, and only what the Document.xml schema knows.

const kid = (n: XNode | undefined, name: string) => n?.children.find((c) => c.name === name);
const kids = (n: XNode | undefined, name: string) => (n?.children ?? []).filter((c) => c.name === name);

/** Attribute lookup, case-insensitive: files in the wild mix Url with URL, PlainText with plaintext. */
function attr(n: XNode | undefined, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(n?.attrs ?? {})) if (k.toLowerCase() === lower) return v;
  return undefined;
}

/** "#rrggbb" from a MindManager colour, which is "aarrggbb" (alpha first; a 00 alpha is no colour); a plain #rrggbb is kept. */
function mmColor(v: string | undefined): string | undefined {
  const s = v?.trim().replace(/^#/, "");
  if (!s || !/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return undefined;
  if (s.length === 8) return /^00/i.test(s) ? undefined : "#" + s.slice(2).toLowerCase();
  return "#" + s.toLowerCase();
}

/** The task priority (1-9) of a MindManager priority id ("urn:mindjet:Prio3"). */
const prioOf = (v: string | undefined): number | undefined => {
  const m = /^urn:mindjet:Prio([1-9])$/i.exec(v ?? "");
  return m ? Number(m[1]) : undefined;
};

/** The task progress of a TaskPercentage (0-100) clamped into range; undefined when there is none. */
const progressOf = (v: string | undefined): number | undefined => {
  if (v === undefined || !v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : undefined;
};

/** A topic's subtopics: the Topics of its SubTopics, then any direct Topic children (the simplified schema some tools write). */
const subTopicsOf = (t: XNode): XNode[] => [...kids(kid(t, "SubTopics"), "Topic"), ...kids(t, "Topic")];

// MindManager positions are in millimetres; the canvas works in pixels (96 dpi).
const PX_PER_MM = 96 / 25.4;

/** One MindManager topic -> one Cartocortex topic. `depth` 0 is the central topic of a map. */
function topicFromXml(t: XNode, ids: Map<string, string>, depth: number): Node {
  const children = subTopicsOf(t).map((c) => topicFromXml(c, ids, depth + 1));
  // The floating topics of the central topic float on the canvas; those of any other topic are its callouts, which open as plain children.
  if (depth > 0) children.push(...kids(kid(t, "FloatingTopics"), "Topic").map((c) => topicFromXml(c, ids, depth + 1)));
  const textEl = kid(t, "Text");
  const text = attr(textEl, "PlainText") ?? attr(t, "Text") ?? "";
  const note = (attr(kid(kid(t, "NotesGroup"), "NotesXhtmlData"), "PreviewPlainText") ?? kid(t, "Notes")?.text.trim() ?? "").trim();
  const url = attr(kid(t, "Hyperlink"), "Url");
  const link = url && !url.startsWith("#") ? url : undefined; // a "#xpointer(...)" Url points at another topic: dropped
  const task = kid(t, "Task");
  const icons = [...kids(kid(kid(t, "IconsGroup"), "Icons"), "Icon"), ...kids(t, "Icon")];
  const priority = prioOf(attr(task, "TaskPriority")) ?? icons.map((i) => prioOf(attr(i, "IconType"))).find((p) => p !== undefined);
  const progress = progressOf(attr(task, "TaskPercentage"));
  const colorEl = kid(t, "Color");
  const fill = mmColor(attr(colorEl, "FillColor") ?? attr(colorEl, "Value"));
  const ink = mmColor(attr(kid(textEl, "Font"), "Color"));
  const view = kids(t, "TopicViewGroup").find((g) => attr(g, "ViewIndex") === "0") ?? kids(t, "TopicViewGroup")[0];
  const folded = attr(kid(view, "Collapsed"), "Collapsed")?.toLowerCase() === "true";
  const node: Node = {
    id: crypto.randomUUID(),
    text,
    children,
    ...(note ? { note } : {}),
    ...(link ? { link } : {}),
    ...(fill ? { color: fill } : {}),
    ...(ink ? { textColor: ink } : {}),
    ...(folded && children.length ? { collapsed: true } : {}),
    ...(priority ? { priority } : {}),
    ...(progress !== undefined ? { progress } : {}),
  };
  const oid = attr(t, "OId") ?? attr(t, "ID");
  if (oid) ids.set(oid, node.id); // for relationships: MindManager's id -> ours
  return node;
}

/** The root topic: an ordinary topic plus the layout its subtopics' growth direction picks, and the map's floating topics. */
function rootFromXml(x: XNode, ids: Map<string, string>, map: XNode | undefined): Node {
  const node = topicFromXml(x, ids, 0);
  const sides = subTopicsOf(x).map((t) => (Number(attr(kid(t, "Offset"), "CX")) < 0 ? -1 : 1));
  const direction = growthOf(x, map);
  if (direction === "Left") node.layout = "left"; // everything grows to the left, in order
  else if (direction !== "Right") {
    // Both sides (MindManager's default): a two-sided map grows its right half first, so right-side topics come first.
    node.layout = "map";
    node.children = node.children.filter((_, i) => sides[i] >= 0).concat(node.children.filter((_, i) => sides[i] < 0));
  }
  for (const f of kids(kid(x, "FloatingTopics"), "Topic")) {
    const n = topicFromXml(f, ids, 1);
    const off = kid(f, "Offset");
    n.float = { x: Math.round((Number(attr(off, "CX")) || 0) * PX_PER_MM), y: Math.round((Number(attr(off, "CY")) || 0) * PX_PER_MM) };
    node.children.push(n);
  }
  return node;
}

/** Where the central topic's subtopics grow, from its own SubTopicsShape or the StyleGroup default: "Left", "Right" or both. */
function growthOf(x: XNode, map: XNode | undefined): string {
  const defaults = kid(kid(kid(map, "StyleGroup"), "RootTopicDefaultsGroup"), "DefaultSubTopicsShape");
  const dir = attr(kid(x, "SubTopicsShape"), "SubTopicsGrowthDirection") ?? attr(defaults, "SubTopicsGrowthDirection") ?? "";
  return dir.replace(/^urn:mindjet:/i, "");
}

/** The map's relationships, their ends remapped to our topic ids; one pointing at a missing topic is dropped. */
function relsOf(map: XNode, ids: Map<string, string>): NonNullable<Node["rels"]> {
  const out: NonNullable<Node["rels"]> = [];
  for (const rel of kids(kid(map, "Relationships"), "Relationship")) {
    const end = (index: string) => {
      const g = kids(rel, "ConnectionGroup").find((c) => attr(c, "Index") === index);
      return ids.get(attr(kid(kid(g, "Connection"), "ObjectReference"), "OIdRef") ?? "");
    };
    const from = ids.get(attr(rel, "FromTopicID") ?? "") ?? end("0");
    const to = ids.get(attr(rel, "ToTopicID") ?? "") ?? end("1");
    if (from && to) out.push({ id: crypto.randomUUID(), from, to });
  }
  return out;
}

/** The root topics of a .mmap map. The growth direction of the central topic opens as a logic (left), logic (right) or two-sided (map) chart. */
export function fromMindmanager(src: string): Node[] {
  const root = parseXml(src); // throws on DOCTYPE, on anything but plain XML
  const map = root.name === "Map" ? root : undefined;
  const ids = new Map<string, string>();
  const tops = map
    ? [...kids(map, "OneTopic").map((o) => kid(o, "Topic")), ...kids(map, "Topic")].filter((t): t is XNode => !!t)
    : root.name === "Topic"
      ? [root]
      : [];
  const roots = tops.map((x) => rootFromXml(x, ids, map));
  if (!roots.length) throw new Error("no topic found in this mind map");
  const rels = map ? relsOf(map, ids) : [];
  if (rels.length) roots[0].rels = rels; // relationship lines live on the open sheet's root topic
  return roots;
}

/** A .mmap file: a zip holding Document.xml (magic bytes "PK"), or flat XML. */
export async function fromMindmanagerBytes(bytes: Uint8Array): Promise<Node[]> {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = await unzip(bytes);
    const doc = [...files.entries()].find(([name]) => name.toLowerCase() === "document.xml");
    if (!doc) throw new Error("no Document.xml in this MindManager file");
    return fromMindmanager(new TextDecoder().decode(doc[1]));
  }
  return fromMindmanager(new TextDecoder().decode(bytes)); // the flat XML of MindManager 10 for Mac
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const escAttr = (s: string) => esc(s).replace(/\n/g, "&#xA;"); // a literal newline in an attribute would read back as a space

/** MindManager writes colours as "aarrggbb", alpha first. */
const mmHex = (c: string | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? "ff" + c.slice(1).toLowerCase() : undefined);

/** One Cartocortex topic -> one MindManager topic. */
function topicToXml(n: Node, mm: Map<string, string>): string {
  const ink = mmHex(n.textColor);
  const inner = [`<ap:Text PlainText="${escAttr(n.text)}"${ink ? `><ap:Font Color="${ink}"/></ap:Text>` : "/>"}`];
  const fill = mmHex(n.color);
  if (fill) inner.push(`<ap:Color FillColor="${fill}"/>`);
  if (n.link) inner.push(`<ap:Hyperlink Url="${escAttr(n.link)}"/>`);
  if (n.note) {
    const body = n.note.split("\n").map((l) => `<p>${esc(l)}</p>`).join("");
    inner.push(`<ap:NotesGroup><ap:NotesXhtmlData PreviewPlainText="${escAttr(n.note)}"><html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html></ap:NotesXhtmlData></ap:NotesGroup>`);
  }
  if (n.priority || n.progress != null) {
    const p = n.priority ? ` TaskPriority="urn:mindjet:Prio${Math.min(9, Math.max(1, Math.round(n.priority)))}"` : "";
    const g = n.progress != null ? ` TaskPercentage="${Math.min(100, Math.max(0, Math.round(n.progress)))}"` : "";
    inner.push(`<ap:Task${p}${g}/>`);
  }
  if (n.collapsed && n.children.length) inner.push(`<ap:TopicViewGroup ViewIndex="0"><ap:Collapsed Collapsed="true"/></ap:TopicViewGroup>`);
  if (n.children.length) inner.push(`<ap:SubTopics>${n.children.map((c) => topicToXml(c, mm)).join("")}</ap:SubTopics>`);
  return `<ap:Topic OId="${mm.get(n.id)}">${inner.join("")}</ap:Topic>`;
}

/** A .mmap file from Cartocortex sheets: one map per sheet, so extra sheets may not show in MindManager itself. */
export function toMindmanager(roots: Node[]): Uint8Array {
  const mm = new Map<string, string>();
  const claim = (n: Node) => (mm.set(n.id, crypto.randomUUID()), n.children.forEach(claim));
  roots.forEach(claim); // every id first: a relationship may point at a topic that comes later
  const oneTopics = roots.map((r) => `<ap:OneTopic>${topicToXml(r, mm)}</ap:OneTopic>`).join("");
  const rels = ((roots[0]?.rels ?? []) as NonNullable<Node["rels"]>)
    .filter((r) => mm.has(r.from) && mm.has(r.to))
    .map(
      (r) =>
        `<ap:Relationship>` +
        ["0", "1"]
          .map((i) => `<ap:ConnectionGroup Index="${i}"><ap:Connection><ap:ObjectReference OIdRef="${mm.get(i === "0" ? r.from : r.to)}"/></ap:Connection></ap:ConnectionGroup>`)
          .join("") +
        `</ap:Relationship>`,
    )
    .join("");
  const document =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ap:Map xmlns:ap="http://schemas.mindjet.com/MindManager/Application/2003">${oneTopics}${rels ? `<ap:Relationships>${rels}</ap:Relationships>` : ""}</ap:Map>`;
  return zip({
    "Document.xml": document,
    // The OPC parts of the archive, kept minimal.
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>\n`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.mindjet.com/document" Target="/Document.xml"/></Relationships>\n`,
  });
}
