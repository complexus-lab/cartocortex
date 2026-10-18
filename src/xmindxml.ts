import { Node } from "./model";
import { fromMarkers, lostMarkers } from "./task";
import { Report } from "./importreport";

// Reader for the XML-only .xmind format (XMind 8 and earlier: content.xml inside the zip).
// Deliberately tiny and strict: no DOCTYPE (so no entity tricks), only the five predefined entities plus numeric ones.

export type XNode = { name: string; attrs: Record<string, string>; children: XNode[]; text: string };

const local = (name: string) => name.replace(/^.*:/, ""); // drop namespace prefixes: xlink:href -> href

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e.toLowerCase()] ?? m;
  });

export function parseXml(src: string): XNode {
  if (/<!DOCTYPE/i.test(src)) throw new Error("XML with a DOCTYPE is not supported");
  const root: XNode = { name: "", attrs: {}, children: [], text: "" };
  const stack = [root];
  const bad = () => new Error("malformed XML");
  let i = 0;
  while (i < src.length) {
    const cur = stack[stack.length - 1];
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      cur.text += decode(src.slice(i));
      break;
    }
    if (lt > i) cur.text += decode(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const e = src.indexOf("-->", lt);
      if (e < 0) throw bad();
      i = e + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const e = src.indexOf("]]>", lt);
      if (e < 0) throw bad();
      cur.text += src.slice(lt + 9, e);
      i = e + 3;
    } else if (src.startsWith("<?", lt)) {
      const e = src.indexOf("?>", lt);
      if (e < 0) throw bad();
      i = e + 2;
    } else {
      let q = "", gt = lt + 1;
      for (; gt < src.length; gt++) {
        const c = src[gt];
        if (q) q = c === q ? "" : q;
        else if (c === '"' || c === "'") q = c;
        else if (c === ">") break;
      }
      if (gt >= src.length) throw bad();
      const tag = src.slice(lt + 1, gt);
      if (tag.startsWith("/")) {
        const done = stack.pop()!;
        if (!stack.length || done.name !== local(tag.slice(1).trim())) throw bad();
      } else {
        const self = tag.endsWith("/");
        const body = self ? tag.slice(0, -1) : tag;
        const name = /^[^\s/]+/.exec(body)?.[0];
        if (!name) throw bad();
        const attrs: Record<string, string> = {};
        for (const m of body.slice(name.length).matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[local(m[1])] = decode(m[2] ?? m[3] ?? "");
        const node: XNode = { name: local(name), attrs, children: [], text: "" };
        cur.children.push(node);
        if (!self) stack.push(node);
      }
      i = gt + 1;
    }
  }
  if (stack.length !== 1 || !root.children[0]) throw bad();
  return root.children[0];
}

const kid = (n: XNode, name: string) => n.children.find((c) => c.name === name);
const allText = (n: XNode): string => n.text.trim() || n.children.map(allText).filter(Boolean).join("\n");

/** The structure for an XMind structure class, or undefined for the default logic chart. Variants the editor lacks open as the nearest one. */
export function layoutOf(structureClass: string): Node["layout"] | undefined {
  if (structureClass.includes("logic.left")) return "left";
  if (structureClass.includes("brace")) return structureClass.includes("brace.left") ? "brace-left" : "brace";
  if (structureClass.includes("spreadsheet")) return /row/i.test(structureClass) ? "matrix-row" : "matrix"; // XMind's matrix, by rows or by columns
  if (structureClass.includes("fishbone")) return structureClass.includes("leftHeaded") ? "fish-left" : "fish";
  if (structureClass.includes("timeline")) return structureClass.includes("vertical") ? "vline" : "line";
  if (structureClass.includes("org-chart")) return structureClass.includes("org-chart.up") ? "up" : "down";
  if (structureClass.includes("treetable")) return "tree"; // a table with tree rows: nearest is the indented tree
  if (structureClass.includes("tree")) return structureClass.includes("tree.left") ? "tree-left" : "tree";
  if (structureClass.includes("map.anticlockwise")) return "map-ccw";
  if (structureClass.includes("map")) return "map";
  return undefined;
}

/** Structure classes that open exactly as XMind draws them (layout name -> class); any other class is approximated. */
const EXACT: Record<string, string> = {
  "org.xmind.ui.logic.right": "right", "org.xmind.ui.logic.left": "left", "org.xmind.ui.map.clockwise": "map",
  "org.xmind.ui.org-chart.down": "down", "org.xmind.ui.tree.right": "tree", "org.xmind.ui.fishbone.rightHeaded": "fish",
  "org.xmind.ui.timeline.horizontal": "line", "org.xmind.ui.timeline.vertical": "vline", "org.xmind.ui.brace.right": "brace", "org.xmind.ui.spreadsheet.column": "matrix", "org.xmind.ui.spreadsheet.row": "matrix-row",
  "org.xmind.ui.org-chart.up": "up", "org.xmind.ui.tree.left": "tree-left", "org.xmind.ui.brace.left": "brace-left",
  "org.xmind.ui.fishbone.leftHeaded": "fish-left", "org.xmind.ui.map.anticlockwise": "map-ccw",
};

/** Records a structure XMind uses that opens as the nearest one here. An absent class is XMind's default and loses nothing. */
export function noteStructure(structureClass: string, layout: Node["layout"], rep: Report) {
  if (!structureClass || EXACT[structureClass] === (layout ?? "right")) return;
  rep.add(`structure ${structureClass.replace(/^org\.xmind\.ui\./, "")} opened as ${layout ?? "logic chart"}`);
}

/**
 * The topics the boundaries of `t` wrap. "master" wraps `t` itself; a range wraps those of its children. The editor has no boundary over
 * several siblings, so each of them gets its own, and the title a boundary can carry has nowhere to go.
 */
export function boundTopics(t: Node, boundaries: { range?: string; title?: string }[], rep: Report): string[] {
  const out: string[] = [];
  for (const b of boundaries) {
    const m = /^\((\d+),(\d*)\)$/.exec(b.range ?? ""); // XMind 7 writes an open end, "(2,)", for "to the last one"
    const wrapped = b.range === "master" ? [t] : m ? t.children.slice(Number(m[1]), m[2] === "" ? undefined : Number(m[2]) + 1) : [];
    if (!wrapped.length) rep.add("boundaries dropped");
    if (wrapped.length > 1) rep.add("boundaries over several topics drawn around each topic");
    if (wrapped.length && b.title?.trim()) rep.add("boundary titles dropped");
    out.push(...wrapped.map((w) => w.id));
  }
  return out;
}

/**
 * What an XMind structure on a single topic becomes: the layout it can have in the editor (an org chart or tree chart branch inside a
 * logic chart or map), "drop" when it cannot be kept, undefined when it is the sheet's own structure and changes nothing.
 */
export function topicStructure(structureClass: string, rootClass: string): Node["layout"] | "drop" | undefined {
  if (!structureClass || structureClass === rootClass) return undefined;
  const sheet = layoutOf(rootClass), mine = layoutOf(structureClass);
  const sideways = sheet === undefined || sheet === "left" || sheet === "map"; // the sheets that can hold branches with a structure of their own
  const keeps = mine === "down" || mine === "up" || mine === "tree" || mine === "tree-left";
  return sideways && keeps && EXACT[structureClass] === mine ? mine : "drop";
}

/** XMind writes a link to another topic as the href "xmind:#<topic id>". */
export const topicHref = (href: string | undefined) => (href?.startsWith("xmind:#") ? href.slice(7) : undefined);

/** Point topic links at the new ids an import assigned (`ids` maps XMind's topic ids to ours). Links to missing topics are dropped. */
export function resolveTopicLinks(roots: Node[], ids: Map<string, string>) {
  const fix = (n: Node) => {
    if (n.topicLink) {
      const to = ids.get(n.topicLink);
      if (to) n.topicLink = to;
      else delete n.topicLink;
    }
    n.children.forEach(fix);
  };
  roots.forEach(fix);
}

function topicFromXml(t: XNode, ids: Map<string, string>, rep: Report, bounds: string[], rootClass?: string): Node {
  const own = rootClass === undefined ? undefined : topicStructure(t.attrs["structure-class"] ?? "", rootClass);
  if (own === "drop") rep.add("structures set on individual topics dropped");
  const attached = kid(t, "children")?.children.find((c) => c.name === "topics" && (c.attrs.type ?? "attached") === "attached");
  const children = (attached?.children ?? []).filter((c) => c.name === "topic").map((c) => topicFromXml(c, ids, rep, bounds, rootClass ?? t.attrs["structure-class"] ?? ""));
  const subs = kid(t, "children")?.children.filter((c) => c.name === "topics") ?? [];
  rep.add("floating topics dropped", subs.filter((c) => c.attrs.type === "detached").reduce((n, c) => n + c.children.length, 0));
  rep.add("summaries dropped", subs.filter((c) => c.attrs.type === "summary").reduce((n, c) => n + c.children.length, 0));
  rep.add("labels dropped", kid(t, "labels")?.children.length ?? 0);
  const notes = kid(t, "notes");
  const note = notes ? (kid(notes, "plain") ? kid(notes, "plain")!.text : allText(notes)).trim() : "";
  const markers = (kid(t, "marker-refs")?.children ?? []).map((m) => m.attrs["marker-id"]).filter(Boolean);
  rep.add("markers with no counterpart dropped", lostMarkers(markers));
  const to = topicHref(t.attrs.href);
  const node: Node = {
    id: crypto.randomUUID(),
    text: kid(t, "title")?.text ?? "",
    children,
    ...(to ? { topicLink: to } : t.attrs.href ? { link: t.attrs.href } : {}),
    ...(note ? { note } : {}),
    ...(t.attrs.branch === "folded" && children.length ? { collapsed: true } : {}),
    ...fromMarkers(markers),
  };
  if (own && own !== "drop") node.layout = own;
  const boundaries = (kid(t, "boundaries")?.children ?? []).map((b) => ({ range: b.attrs.range, title: kid(b, "title")?.text }));
  bounds.push(...boundTopics(node, boundaries, rep));
  if (t.attrs.id) ids.set(t.attrs.id, node.id);
  return node;
}

/** Every sheet's root topic from an XMind 8 content.xml. Styles, relationships, floating topics and other markers are dropped. */
export function sheetsFromXml(src: string, rep = new Report()): Node[] {
  const ids = new Map<string, string>();
  const roots = parseXml(src)
    .children.filter((c) => c.name === "sheet")
    .flatMap((sheet) => {
      const t = kid(sheet, "topic");
      if (!t) return [];
      const bounds: string[] = [];
      const root = topicFromXml(t, ids, rep, bounds);
      if (bounds.length) root.bounds = bounds;
      const sc = t.attrs["structure-class"] ?? "";
      const layout = layoutOf(sc);
      if (layout) root.layout = layout;
      noteStructure(sc, layout, rep);
      rep.add("relationships dropped", kid(sheet, "relationships")?.children.length ?? 0);
      const title = kid(sheet, "title")?.text.trim();
      if (title) root.title = title;
      return [root];
    });
  if (!roots.length) throw new Error("no sheet found");
  resolveTopicLinks(roots, ids);
  return roots;
}
