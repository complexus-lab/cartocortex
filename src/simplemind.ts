import { Node } from "./model";
import { parseXml, XNode } from "./xmindxml";
import { unzip, zip } from "./xmind";

// Reader and writer for SimpleMind's .smmx format: a zip holding document/mindmap.xml. The topics form a
// flat list inside <topics>, each one pointing at its parent by id ("-1" for a map's own root), and a file
// can hold several <mindmap> elements, which open as one sheet each; a line break inside a topic's text
// travels as the two characters "\N". The file starts with a byte-order mark and a DOCTYPE, both refused
// by Cartocortex's strict XML reader, so they are dropped on the way in and written back on the way out.
// Callout labels, boundaries, colours and positions are not carried either way. The reading follows a map
// saved by SimpleMind itself; the writing follows the same shape, but has not been checked against
// SimpleMind itself.

const kid = (n: XNode, name: string) => n.children.find((c) => c.name === name);

/** One SimpleMind topic -> one Cartocortex topic: the flat list's hierarchy hangs on the parent ids. */
function nodeOf(t: XNode): Node {
  const note = kid(t, "note")?.text.trim().replace(/\\N/g, "\n");
  const link = kid(t, "link")?.attrs.urllink;
  const progress = t.attrs.progress != null ? Number(t.attrs.progress) : t.attrs.checked === "true" ? 100 : t.attrs.checkbox === "true" ? 0 : undefined;
  return {
    id: crypto.randomUUID(),
    text: (t.attrs.text ?? "").replace(/\\N/g, "\n"),
    children: [],
    ...(note ? { note } : {}),
    ...(link ? { link } : {}),
    ...(progress != null && Number.isInteger(progress) && progress >= 0 && progress <= 100 ? { progress } : {}),
  };
}

/** The sheets of an .smmx file: every <mindmap> in it opens as one sheet, its roots in file order. */
export async function fromSimplemindBytes(bytes: Uint8Array): Promise<Node[]> {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("not a SimpleMind .smmx file");
  const files = await unzip(bytes);
  const entry = [...files.entries()].find(([name]) => name.toLowerCase() === "document/mindmap.xml");
  if (!entry) throw new Error("no document/mindmap.xml in this SimpleMind file");
  const doc = parseXml(new TextDecoder().decode(entry[1]).replace(/^\uFEFF/, "").replace(/<!DOCTYPE[^>]*>/i, ""));
  if (doc.name !== "simplemind-mindmaps") throw new Error("not a SimpleMind map");
  const sheets: Node[] = [];
  for (const map of doc.children.filter((c) => c.name === "mindmap")) {
    const roots: Node[] = [];
    const byId = new Map<string, Node>();
    for (const t of (kid(map, "topics") ?? map).children.filter((c) => c.name === "topic")) {
      const n = nodeOf(t);
      const p = byId.get(t.attrs.parent ?? ""); // only a parent already seen can hang a topic below itself
      if (t.attrs.id != null) byId.set(t.attrs.id, n);
      p && p !== n ? p.children.push(n) : roots.push(n); // a topic with no parent to hang on opens as its own sheet
    }
    const rels = (kid(map, "relations")?.children ?? [])
      .filter((c) => c.name === "relation")
      .flatMap((c) => {
        const from = byId.get(c.attrs.source ?? "")?.id, to = byId.get(c.attrs.target ?? "")?.id;
        return from && to ? [{ id: crypto.randomUUID(), from, to }] : [];
      });
    const title = kid(kid(map, "meta") ?? map, "title")?.attrs.text;
    roots.forEach((r, i) => {
      if (i === 0 && title) r.title = title;
      if (i === 0 && rels.length) r.rels = rels;
      sheets.push(r);
    });
  }
  if (!sheets.length) throw new Error("no topic found in this mind map");
  return sheets;
}

/** Attribute and text escapes; a line break travels as the two characters "\N", the way SimpleMind writes it. */
const esc = (s: string) =>
  s.replace(/[&<>"'\n]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;", "\n": "\\N" })[c]!);

/** One Cartocortex sheet -> one SimpleMind mindmap: a flat topic list, ids "0", "1"..., the root's parent "-1". */
function mindmapXml(root: Node): string {
  const ids = new Map<string, string>(); // a topic's id in the map -> the id it gets in the file
  const topics: string[] = [];
  const walk = (n: Node, parent: string): void => {
    const id = String(topics.length);
    ids.set(n.id, id);
    const note = n.note ? `<note>${esc(n.note)}</note>` : "";
    const link = n.link ? `<link urllink="${esc(n.link)}"/>` : "";
    const task = n.progress != null ? ` checkbox="true" progress="${Math.round(n.progress)}"` : "";
    topics.push(`            <topic id="${id}" parent="${parent}" guid="${crypto.randomUUID()}" text="${esc(n.text)}" textfmt="plain"${task}>${note}${link}</topic>\n`);
    n.children.forEach((c) => walk(c, id));
  };
  walk(root, "-1");
  const relations = (root.rels ?? [])
    .flatMap((r) => {
      const source = ids.get(r.from), target = ids.get(r.to);
      return source && target ? [`            <relation source="${source}" target="${target}"/>\n`] : [];
    })
    .join("");
  return (
    `    <mindmap>\n        <meta><guid guid="${crypto.randomUUID()}"/><title text="${esc(root.title ?? root.text)}"/></meta>\n        <topics>\n${topics.join("")}        </topics>\n` +
    (relations ? `        <relations>\n${relations}        </relations>\n` : `        <relations></relations>\n`) +
    `        <node-groups></node-groups>\n    </mindmap>\n`
  );
}

/** An .smmx file from Cartocortex sheets: one SimpleMind mindmap per sheet, so extra sheets may not show in SimpleMind itself. */
export function toSimplemind(roots: Node[]): Uint8Array {
  return zip({
    "document/mindmap.xml":
      '\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE simplemind-mindmaps>\n<simplemind-mindmaps doc-version="3" generator="Cartocortex" gen-version="0.1.1">\n' +
      roots.map(mindmapXml).join("") +
      "</simplemind-mindmaps>\n",
  });
}
