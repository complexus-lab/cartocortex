import { Node } from "./model";
import { parseXml, XNode } from "./xmindxml";
import { unzip, zip } from "./xmind";

// Reader and writer for iThoughts' .itmz format: a zip holding one mapdata.xml (plus sometimes a preview
// picture or a style, which Cartocortex does not need). Topics nest: a topic's children are the <topic>
// elements inside it, in file order, and its text and note are attributes, with line breaks travelling as
// numeric escapes. iThoughts keeps one root topic per map, so a topic at the top level besides the map's
// own opens as its own sheet. The older iThoughtsHD .itm files are not covered. The format was taken from
// what iThoughts writes (as documented by toketaWare and the iThoughts community) and from MultiMarkdown's
// own exporter, and has not been checked against iThoughts itself.

/** One iThoughts topic -> one Cartocortex topic: children are the nested <topic> elements, in file order. */
function topicOf(t: XNode): Node {
  const note = (t.attrs.note ?? "").trim();
  return {
    id: crypto.randomUUID(),
    text: t.attrs.text ?? "",
    children: t.children.filter((c) => c.name === "topic").map(topicOf),
    ...(note ? { note } : {}),
  };
}

/** The root topics of an .itmz map: the map's own topic first, then any other at the top level as its own sheet. */
export async function fromIthoughtsBytes(bytes: Uint8Array): Promise<Node[]> {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("not an iThoughts .itmz file (an older iThoughtsHD .itm map is not read)");
  const files = await unzip(bytes);
  const entry = [...files.entries()].find(([name]) => name.toLowerCase() === "mapdata.xml");
  if (!entry) throw new Error("no mapdata.xml in this iThoughts file");
  const map = parseXml(new TextDecoder().decode(entry[1]));
  if (map.name !== "iThoughts" && map.name !== "topics") throw new Error("not an iThoughts map");
  // iThoughts wraps its topics in a <topics> element; MultiMarkdown writes them straight inside <iThoughts>.
  const holder = map.name === "topics" ? map : map.children.find((c) => c.name === "topics") ?? map;
  const topics = holder.children.filter((c) => c.name === "topic");
  if (!topics.length) throw new Error("no topic found in this mind map");
  return topics.map(topicOf);
}

/** Attribute escapes, the set iThoughts and MultiMarkdown both write: the five XML entities, plus line breaks and tabs. */
const esc = (s: string) =>
  s.replace(/[&<>"'\n\r\t]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;", "\n": "&#10;", "\r": "&#13;", "\t": "&#9;" })[c]!);

/** One Cartocortex topic -> one iThoughts topic: a leaf closes itself, the way iThoughts writes one. */
function topicXml(n: Node): string {
  const note = n.note ? ` note="${esc(n.note)}"` : "";
  return n.children.length
    ? `<topic uuid="${crypto.randomUUID()}" text="${esc(n.text)}"${note}>\n${n.children.map(topicXml).join("")}</topic>\n`
    : `<topic uuid="${crypto.randomUUID()}" text="${esc(n.text)}"${note}/>\n`;
}

/** An .itmz file from Cartocortex sheets: one iThoughts map per sheet, so extra sheets may not show in iThoughts itself. */
export function toIthoughts(roots: Node[]): Uint8Array {
  return zip({
    "mapdata.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<iThoughts>\n<topics>\n${roots.map(topicXml).join("")}</topics>\n</iThoughts>\n`,
  });
}
