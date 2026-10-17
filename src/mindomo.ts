import { Node } from "./model";
import { unzip, zip } from "./xmind";

// Reader and writer for Mindomo Desktop's .mom format: a zip of JSON parts. document.json holds the
// map's name and the id of its root topic, nodes.json every topic in one flat list (each child pointing
// at its parent), relations.json the map's relationship lines, and themes.json, changes.json and
// Document.xml parts Cartocortex does not need. The packed .pmom variant and the older XML
// "Mindomo XML Map" files are not covered. The format was taken apart from files saved by Mindomo
// Desktop 11, and has not been checked against Mindomo itself.

/** One entry of Mindomo's nodes.json: a topic in the flat list. Children point at their parent, siblings carry an `index`, and a file saved after a delete keeps the topic marked `deleted: true`. */
type MomNode = {
  id: string;
  parentId?: string;
  title?: string;
  deleted?: boolean;
  index?: number;
  style?: { expanded?: boolean };
  multimediaUrl?: string; // a video or web address Mindomo shows on the topic
};

/** Mindomo's document.json; only the parts the reader needs. */
type MomDoc = { mapInfo?: { name?: string; rootId?: string } };

/** The topic's media link, when it is an ordinary web address. */
const linkOf = (n: MomNode) => (/^https?:\/\//i.test(n.multimediaUrl ?? "") ? n.multimediaUrl : undefined);

/** The tree hanging off one Mindomo topic: children by their `index`, ties by list order. */
function treeOf(n: MomNode, kids: Map<string, MomNode[]>, ids: Map<string, string>): Node {
  const children = [...(kids.get(n.id) ?? [])]
    .sort((a, b) => (a.index ?? 1e9) - (b.index ?? 1e9))
    .map((c) => treeOf(c, kids, ids));
  const link = linkOf(n);
  const node: Node = {
    id: crypto.randomUUID(),
    text: n.title ?? "",
    children,
    ...(link ? { link } : {}),
    ...(n.style?.expanded === false && children.length ? { collapsed: true } : {}),
  };
  ids.set(n.id, node.id); // lets relationships find their new ends
  return node;
}

/** The root topics of a .mom map: the tree of document.json's rootId (or of the topic without a parent), then any other parentless topic as its own sheet. */
export async function fromMindomoBytes(bytes: Uint8Array): Promise<Node[]> {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("not a Mindomo .mom file (an older Mindomo XML map is not read)");
  const files = await unzip(bytes);
  const nodesFile = [...files.entries()].find(([name]) => name.toLowerCase() === "nodes.json");
  if (!nodesFile) throw new Error("no nodes.json in this Mindomo file");
  const doc = files.has("document.json") ? (JSON.parse(new TextDecoder().decode(files.get("document.json")!)) as MomDoc) : {};
  const all = JSON.parse(new TextDecoder().decode(nodesFile[1])) as MomNode[];
  const byId = new Map<string, MomNode>();
  for (const n of all) if (typeof n.id === "string" && !byId.has(n.id)) byId.set(n.id, n);
  // A file saved after a delete keeps the topic, marked `deleted`; anything under it is gone with it.
  const dead = new Set<string>();
  const gone = (n: MomNode, seen: Set<string>): boolean => {
    if (dead.has(n.id)) return true;
    if (n.deleted) return (dead.add(n.id), true);
    if (n.parentId === undefined) return false;
    const p = byId.get(n.parentId);
    if (!p) throw new Error(`a topic points at parent "${n.parentId}", which is not in this file`);
    if (seen.has(n.id)) return true; // parents that loop never reach the root: gone with the loop
    seen.add(n.id);
    return gone(p, seen) ? (dead.add(n.id), true) : false;
  };
  const nodes = all.filter((n) => typeof n.id === "string" && byId.get(n.id) === n && !gone(n, new Set()));
  const kids = new Map<string, MomNode[]>();
  for (const n of nodes) {
    if (n.parentId === undefined) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n);
    else kids.set(n.parentId, [n]);
  }
  const ids = new Map<string, string>();
  const rootId = doc.mapInfo?.rootId;
  const parentless = nodes.filter((n) => n.parentId === undefined);
  const roots: Node[] = [];
  if (rootId !== undefined && byId.has(rootId) && !dead.has(rootId)) roots.push(treeOf(byId.get(rootId)!, kids, ids));
  roots.push(...parentless.filter((n) => n.id !== rootId).map((n) => treeOf(n, kids, ids)));
  if (!roots.length) throw new Error("no topic found in this mind map");
  if (ids.size !== nodes.length) throw new Error(`${nodes.length - ids.size} topic(s) in this file are not part of the map's tree`);
  const name = doc.mapInfo?.name;
  if (name) roots[0].title = name; // the map's name labels the sheet
  const relsFile = [...files.entries()].find(([entry]) => entry.toLowerCase() === "relations.json");
  if (relsFile) {
    const rels = (JSON.parse(new TextDecoder().decode(relsFile[1])) as { fromNodeId?: string; toNodeId?: string }[]).flatMap((r) => {
      const from = ids.get(r.fromNodeId ?? ""), to = ids.get(r.toNodeId ?? "");
      return from && to ? [{ id: crypto.randomUUID(), from, to }] : []; // an end that is gone is dropped
    });
    if (rels.length) roots[0].rels = rels; // relationship lines live on the open sheet's root topic
  }
  return roots;
}

/** A fresh Mindomo id: 32 hex characters, the shape of the ids in Mindomo's own files. */
const momId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Mindomo writes a topic's creation date in the local "YYYY-MM-DD hh:mm:ss" and its modification date in ISO. */
const clock = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    iso: d.toISOString(),
    local: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  };
};

/** One Cartocortex topic -> one Mindomo node, chained to its siblings the way Mindomo keeps them in order. */
function nodeOf(
  n: Node,
  mm: Map<string, string>,
  parent: string | undefined,
  index: number,
  next: string | undefined,
  prev: string | undefined,
  when: { iso: string; local: string },
  central: boolean,
  out: Record<string, unknown>[],
) {
  const id = mm.get(n.id)!;
  out.push({
    version: 42,
    id,
    ...(parent === undefined ? {} : { parentId: parent }),
    ...(next ? { nextId: next } : {}),
    ...(prev ? { previousId: prev } : {}),
    originalId: id,
    title: n.text,
    titleStyle: "<Font />",
    creationDate: when.local,
    modificationDate: when.iso,
    assignedTo: [],
    assignedToVirtual: [],
    index,
    style: central ? { halign: 4, valign: 6, orientation: 100 } : { halign: 4, valign: 6, expanded: !n.collapsed, orientation: 0 },
    comments: { votes: {} },
    creatorId: 0,
    isTemplate: 0,
    type: 0,
    ...(n.link ? { multimediaUrl: n.link, mediaType: 1 } : {}),
  });
  n.children.forEach((c, i, all) =>
    nodeOf(c, mm, id, i, all[i + 1] ? mm.get(all[i + 1].id) : undefined, i ? mm.get(all[i - 1].id) : undefined, when, false, out),
  );
}

/** A .mom file from Cartocortex sheets: one Mindomo map per sheet, so extra sheets may not show in Mindomo itself. Writing is deliberately lossy: titles, folding and links are what is carried. */
export function toMindomo(roots: Node[]): Uint8Array {
  const mm = new Map<string, string>();
  const claim = (n: Node) => (mm.set(n.id, momId()), n.children.forEach(claim));
  roots.forEach(claim); // every id first: a relationship may point at a topic that comes later
  const when = clock();
  const nodes: Record<string, unknown>[] = [];
  roots.forEach((r, i) => nodeOf(r, mm, undefined, 0, undefined, undefined, when, i === 0, nodes));
  const rels = ((roots[0]?.rels ?? []) as NonNullable<Node["rels"]>)
    .filter((r) => mm.has(r.from) && mm.has(r.to))
    .map((r) => ({
      version: 40,
      id: momId(),
      fromNodeId: mm.get(r.from),
      toNodeId: mm.get(r.to),
      ctrlX1: "0",
      ctrlY1: "0",
      ctrlX2: "0",
      ctrlY2: "0",
      width: "1",
      type: "1",
    }));
  const document = {
    version: 40,
    mapInfo: {
      id: momId(),
      name: roots[0]?.title || roots[0]?.text || "Map",
      description: "",
      type: 0,
      creationDate: when.iso,
      modificationDate: when.iso,
      rootId: roots[0] ? mm.get(roots[0].id) : momId(),
      language: "en",
    },
    desktopVersion: "11.1.6",
    commandsFromOrder: 0,
    commandsFromOrderUndo: 0,
    mapUsers: {},
    mapUsersVirtual: {},
  };
  return zip({
    "themes.json": "{}",
    "document.json": JSON.stringify(document),
    "nodes.json": JSON.stringify(nodes),
    ...(rels.length ? { "relations.json": JSON.stringify(rels) } : {}),
    "changes.json": "[]",
    "Document.xml": '<mo:map xmlns:mo="http://schemas.mindomo.com/application/version-5.7"></mo:map>\n',
  });
}
