import { mapSides, Node } from "./model";
import { escXml as esc, escXmlAttr as escAttr, parseXml, xmlText, XNode } from "./xmindxml";
import { unzip, zip } from "./xmind";
import { Report } from "./importreport";
import { normalizeUrl } from "./links";

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
function topicFromXml(t: XNode, ids: Map<string, string>, depth: number, rep: Report): Node {
  const children = subTopicsOf(t).map((c) => topicFromXml(c, ids, depth + 1, rep));
  // The floating topics of the central topic float on the canvas; those of any other topic are its callouts, which open as plain children.
  if (depth > 0) {
    const callouts = kids(kid(t, "FloatingTopics"), "Topic");
    rep.add("callouts opened as subtopics", callouts.length);
    children.push(...callouts.map((c) => topicFromXml(c, ids, depth + 1, rep)));
  }
  rep.add("pictures dropped", t.children.filter((c) => /Image$/.test(c.name)).length);
  rep.add("boundaries dropped", t.children.filter((c) => /Boundary$/.test(c.name)).length);
  const textEl = kid(t, "Text");
  const text = attr(textEl, "PlainText") ?? attr(t, "Text") ?? "";
  const note = (attr(kid(kid(t, "NotesGroup"), "NotesXhtmlData"), "PreviewPlainText") ?? kid(t, "Notes")?.text.trim() ?? "").trim();
  const url = attr(kid(t, "Hyperlink"), "Url");
  // A "#xpointer(...)" Url points at another topic, and anything but a web or mail address (a file path, javascript:) could not be opened: dropped.
  const link = url && /^(https?:\/\/|mailto:)/i.test(url.trim()) && normalizeUrl(url) ? url.trim() : undefined;
  if (url && !link) rep.add(url.startsWith("#") ? "links to other topics dropped" : "links that are not web or mail addresses dropped");
  const task = kid(t, "Task");
  const icons = [...kids(kid(kid(t, "IconsGroup"), "Icons"), "Icon"), ...kids(t, "Icon")];
  const priority = prioOf(attr(task, "TaskPriority")) ?? icons.map((i) => prioOf(attr(i, "IconType"))).find((p) => p !== undefined);
  rep.add("icons with no counterpart dropped", icons.filter((i) => prioOf(attr(i, "IconType")) === undefined).length);
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
function rootFromXml(x: XNode, ids: Map<string, string>, map: XNode | undefined, rep: Report): Node {
  const node = topicFromXml(x, ids, 0, rep);
  const direction = growthOf(x, map);
  if (direction === "Left") node.layout = "left"; // everything grows to the left, in order
  else if (direction !== "Right") {
    // Both sides (MindManager's default). A topic with an offset keeps the side it points to; one without is placed by the map itself.
    node.layout = "map";
    subTopicsOf(x).forEach((t, i) => {
      const cx = Number(attr(kid(t, "Offset"), "CX"));
      if (cx) node.children[i].side = cx < 0 ? "left" : "right";
    });
  }
  for (const f of kids(kid(x, "FloatingTopics"), "Topic")) {
    const n = topicFromXml(f, ids, 1, rep);
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
function relsOf(map: XNode, ids: Map<string, string>, rep: Report): NonNullable<Node["rels"]> {
  const out: NonNullable<Node["rels"]> = [];
  for (const rel of kids(kid(map, "Relationships"), "Relationship")) {
    const end = (index: string) => {
      const g = kids(rel, "ConnectionGroup").find((c) => attr(c, "Index") === index);
      return ids.get(attr(kid(kid(g, "Connection"), "ObjectReference"), "OIdRef") ?? "");
    };
    const from = ids.get(attr(rel, "FromTopicID") ?? "") ?? end("0");
    const to = ids.get(attr(rel, "ToTopicID") ?? "") ?? end("1");
    if (from && to) out.push({ id: crypto.randomUUID(), from, to });
    else rep.add("relationships dropped");
  }
  return out;
}

/** The root topics of a .mmap map. The growth direction of the central topic opens as a logic (left), logic (right) or two-sided (map) chart. */
export function fromMindmanager(src: string, rep = new Report()): Node[] {
  const root = parseXml(src); // throws on DOCTYPE, on anything but plain XML
  const map = root.name === "Map" ? root : undefined;
  const ids = new Map<string, string>();
  const tops = map
    ? [...kids(map, "OneTopic").map((o) => kid(o, "Topic")), ...kids(map, "Topic")].filter((t): t is XNode => !!t)
    : root.name === "Topic"
      ? [root]
      : [];
  const roots = tops.map((x) => rootFromXml(x, ids, map, rep));
  if (!roots.length) throw new Error("no topic found in this mind map");
  // Relationship lines live on the root topic of the sheet that holds both ends; one that spans two maps is dropped.
  const sheet = new Map<string, Node>();
  const own = (r: Node, n: Node) => (sheet.set(n.id, r), n.children.forEach((c) => own(r, c)));
  roots.forEach((r) => own(r, r));
  for (const rel of map ? relsOf(map, ids, rep) : []) {
    const r = sheet.get(rel.from);
    if (r && r === sheet.get(rel.to)) (r.rels ??= []).push(rel);
    else rep.add("relationships dropped");
  }
  return roots;
}

/** A .mmap file: a zip holding Document.xml (magic bytes "PK"), or flat XML; UTF-8 or UTF-16. `lost` lists what could not be carried over. */
export async function fromMindmanagerReport(bytes: Uint8Array): Promise<{ roots: Node[]; lost: string[] }> {
  const rep = new Report();
  let xml = bytes; // the flat XML of MindManager 10 for Mac
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const doc = [...(await unzip(bytes)).entries()].find(([name]) => name.toLowerCase() === "document.xml");
    if (!doc) throw new Error("no Document.xml in this MindManager file");
    xml = doc[1];
  }
  return { roots: fromMindmanager(xmlText(xml), rep), lost: rep.lines() };
}

export const fromMindmanagerBytes = async (bytes: Uint8Array): Promise<Node[]> => (await fromMindmanagerReport(bytes)).roots;

/** MindManager writes colours as "aarrggbb", alpha first. */
const mmHex = (c: string | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? "ff" + c.slice(1).toLowerCase() : undefined);

const mmOf = (px: number) => Math.round((px / PX_PER_MM) * 100) / 100;

/** The growth direction a sheet's structure is written as; structures MindManager lacks go out as its right-growing chart. */
const growthTo = (l: Node["layout"]) => (l === "left" ? "Left" : l === "map" || l === "map-ccw" ? "LeftAndRight" : "Right");

/** One Cartocortex topic -> one MindManager topic. `top` marks the central topic of a sheet, which carries the growth direction and the floating topics. */
function topicToXml(n: Node, mm: Map<string, string>, top = false, cx = 0): string {
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
  const floats = top ? n.children.filter((c) => c.float) : [];
  // A topic that was given its side of a two-sided map says so with the sign of a token offset, which is what the reader goes by.
  const sided = top && (n.layout === "map" || n.layout === "map-ccw") && n.children.some((c) => c.side);
  const lefts = new Set(sided ? mapSides(n)[1] : []);
  const kids = top ? n.children.filter((c) => !c.float) : n.children;
  if (n.float && !top) inner.push(`<ap:Offset CX="${mmOf(n.float.x)}" CY="${mmOf(n.float.y)}"/>`);
  else if (cx) inner.push(`<ap:Offset CX="${cx}" CY="0"/>`);
  if (kids.length) inner.push(`<ap:SubTopics>${kids.map((c) => topicToXml({ ...c, float: undefined }, mm, false, sided ? (lefts.has(c) ? -1 : 1) : 0)).join("")}</ap:SubTopics>`);
  if (top) inner.push(`<ap:SubTopicsShape SubTopicsGrowthDirection="urn:mindjet:${growthTo(n.layout)}"/>`);
  if (floats.length) inner.push(`<ap:FloatingTopics>${floats.map((c) => topicToXml(c, mm)).join("")}</ap:FloatingTopics>`);
  return `<ap:Topic OId="${mm.get(n.id)}">${inner.join("")}</ap:Topic>`;
}

/** A .mmap file from Cartocortex sheets: one map per sheet, so extra sheets may not show in MindManager itself. */
export function toMindmanager(roots: Node[]): Uint8Array {
  const mm = new Map<string, string>();
  const claim = (n: Node) => (mm.set(n.id, crypto.randomUUID()), n.children.forEach(claim));
  roots.forEach(claim); // every id first: a relationship may point at a topic that comes later
  const oneTopics = roots.map((r) => `<ap:OneTopic>${topicToXml(r, mm, true)}</ap:OneTopic>`).join("");
  const rels = roots
    .flatMap((r) => r.rels ?? [])
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
