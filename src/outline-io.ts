import { Node, mk } from "./model";
import { XNode, parseXml } from "./xmindxml";

// Outline formats: Markdown (headings and nested lists) and OPML 2.0, the exchange format of outliners.

const finish = (top: Node[], title: string): Node => {
  if (!top.length) throw new Error("no outline found");
  return top.length === 1 ? top[0] : { ...mk(title), children: top };
};

/** One topic from a line of Markdown: task boxes become progress, the first http(s) / mailto link becomes the topic's link. */
function topicFrom(raw: string): Node {
  const n = mk("");
  let text = raw.trim();
  const box = /^\[( |x|X)\]\s+/.exec(text);
  if (box) {
    n.progress = box[1] === " " ? 0 : 100;
    text = text.slice(box[0].length);
  }
  const link = /\[([^\]]*)\]\(((?:https?|mailto):[^)\s]+)\)/.exec(text);
  if (link) {
    n.link = link[2];
    text = text.replace(link[0], link[1] || link[2]);
  }
  n.text = text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // any other link: keep its label
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
  return n;
}

/**
 * Markdown to a map. Headings and (nested) list items form the hierarchy; plain lines become topics under the
 * current heading. A single top-level topic becomes the root, otherwise the topics hang under one named `fallbackTitle`.
 */
export function fromMarkdown(src: string, fallbackTitle = "Imported map"): Node {
  const top: Node[] = [];
  const stack: { level: number; node: Node; heading: boolean }[] = [];
  const indents: number[] = []; // indentation widths of the list levels currently open
  let heading = 0, fenced = false;
  let text = src.replace(/\r\n?/g, "\n");
  text = text.replace(/^---\n[\s\S]*?\n---\n/, ""); // front matter
  for (const raw of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !raw.trim() || /^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) continue; // code, blank lines, rules
    let level: number, label: string;
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(raw);
    if (h) {
      heading = h[1].length;
      level = heading;
      label = h[2];
      indents.length = 0;
    } else if (li) {
      const width = [...li[1]].reduce((w, c) => w + (c === "\t" ? 4 : 1), 0);
      while (indents.length && width < indents[indents.length - 1]) indents.pop();
      if (!indents.length || width > indents[indents.length - 1]) indents.push(width);
      level = heading + indents.length;
      label = li[3];
    } else {
      level = heading + 1;
      label = raw.trim();
    }
    const n = topicFrom(label);
    // A heading closes everything under the previous heading, including body text and lists, so it never nests under them.
    while (stack.length && (stack[stack.length - 1].level >= level || (h && !stack[stack.length - 1].heading))) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : top).push(n);
    stack.push({ level, node: n, heading: !!h });
  }
  return finish(top, fallbackTitle);
}

/** OPML to a map: `text`, `_note`, `url` and `_status="checked"` are kept. Several top-level outlines hang under one root. */
export function fromOpml(src: string): Node {
  const doc = parseXml(src);
  const body = doc.children.find((c) => c.name === "body");
  if (!body) throw new Error("not an OPML file (no body)");
  const conv = (o: XNode): Node => ({
    ...mk(o.attrs.text ?? o.attrs.title ?? ""),
    children: o.children.filter((c) => c.name === "outline").map(conv),
    ...((o.attrs.url ?? o.attrs.htmlUrl ?? o.attrs.xmlUrl) ? { link: o.attrs.url ?? o.attrs.htmlUrl ?? o.attrs.xmlUrl } : {}),
    ...(o.attrs._note ? { note: o.attrs._note } : {}),
    ...(o.attrs._status === "checked" ? { progress: 100 } : {}),
  });
  const title = doc.children.find((c) => c.name === "head")?.children.find((c) => c.name === "title")?.text.trim();
  return finish(body.children.filter((c) => c.name === "outline").map(conv), title || "Imported map");
}

const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "") // not allowed in XML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r?\n/g, "&#10;");

/** OPML 2.0 with one top-level outline per sheet. Colours, markers and layout are not part of OPML. */
export function toOpml(roots: Node[]): string {
  const outline = (n: Node, pad: string): string => {
    const attrs = `text="${esc(n.text)}"${n.note ? ` _note="${esc(n.note)}"` : ""}${n.link ? ` type="link" url="${esc(n.link)}"` : ""}${n.progress === 100 ? ' _status="checked"' : ""}`;
    return n.children.length ? `${pad}<outline ${attrs}>\n${n.children.map((c) => outline(c, pad + "  ")).join("\n")}\n${pad}</outline>` : `${pad}<outline ${attrs}/>`;
  };
  const title = roots[0]?.title || roots[0]?.text || "Cartocortex";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>${esc(title)}</title></head>\n  <body>\n${roots.map((r) => outline(r, "    ")).join("\n")}\n  </body>\n</opml>\n`;
}
