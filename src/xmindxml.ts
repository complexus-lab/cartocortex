import { Node } from "./model";
import { fromMarkers } from "./task";

// Reader for the XML-only .xmind format (XMind 8 and earlier: content.xml inside the zip).
// Deliberately tiny and strict: no DOCTYPE (so no entity tricks), only the five predefined entities plus numeric ones.

export type XNode = { name: string; attrs: Record<string, string>; children: XNode[]; text: string };

const local = (name: string) => name.replace(/^.*:/, ""); // drop namespace prefixes: xlink:href -> href

export const decode = (s: string) =>
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

/** Logic, map, org chart, tree chart and fishbone; anything else (matrix, timeline…) stays the default logic chart. */
export function layoutOf(structureClass: string): Node["layout"] | undefined {
  if (structureClass.includes("logic.left")) return "left";
  if (structureClass.includes("brace")) return "brace"; // brace.left opens as the right-hand brace
  if (structureClass.includes("spreadsheet")) return "matrix"; // XMind's matrix, row or column
  if (structureClass.includes("fishbone")) return "fish";
  if (structureClass.includes("timeline")) return "line"; // every timeline variant opens as the horizontal one
  if (structureClass.includes("org-chart")) return "down";
  if (structureClass.includes("tree")) return "tree";
  if (structureClass.includes("map")) return "map";
  return undefined;
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

function topicFromXml(t: XNode, ids: Map<string, string>): Node {
  const attached = kid(t, "children")?.children.find((c) => c.name === "topics" && (c.attrs.type ?? "attached") === "attached");
  const children = (attached?.children ?? []).filter((c) => c.name === "topic").map((c) => topicFromXml(c, ids));
  const notes = kid(t, "notes");
  const note = notes ? (kid(notes, "plain") ? kid(notes, "plain")!.text : allText(notes)).trim() : "";
  const markers = (kid(t, "marker-refs")?.children ?? []).map((m) => m.attrs["marker-id"]).filter(Boolean);
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
  if (t.attrs.id) ids.set(t.attrs.id, node.id);
  return node;
}

/** Every sheet's root topic from an XMind 8 content.xml. Styles, relationships, floating topics and other markers are dropped. */
export function sheetsFromXml(src: string): Node[] {
  const ids = new Map<string, string>();
  const roots = parseXml(src)
    .children.filter((c) => c.name === "sheet")
    .flatMap((sheet) => {
      const t = kid(sheet, "topic");
      if (!t) return [];
      const root = topicFromXml(t, ids);
      const layout = layoutOf(t.attrs["structure-class"] ?? "");
      if (layout) root.layout = layout;
      const title = kid(sheet, "title")?.text.trim();
      if (title) root.title = title;
      return [root];
    });
  if (!roots.length) throw new Error("no sheet found");
  resolveTopicLinks(roots, ids);
  return roots;
}
