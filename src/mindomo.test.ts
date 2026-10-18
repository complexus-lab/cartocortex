import { expect, test } from "vitest";
import { mk, Node } from "./model";
import { fromMindomoBytes, toMindomo } from "./mindomo";
import { unzip, zip } from "./xmind";

/** A small .mom, in the shape of the files Mindomo Desktop 11 writes. */
const mom = (nodes: unknown[], relations?: unknown[]) =>
  zip({
    "themes.json": "{}",
    "document.json": JSON.stringify({ version: 40, mapInfo: { id: "d1", name: "Test map", rootId: "root" } }),
    "nodes.json": JSON.stringify(nodes),
    ...(relations ? { "relations.json": JSON.stringify(relations) } : {}),
    "changes.json": "[]",
    "Document.xml": '<mo:map xmlns:mo="http://schemas.mindomo.com/application/version-5.7"></mo:map>',
  });

test("reads a Mindomo map", async () => {
  const bytes = mom(
    [
      { version: 42, id: "root", title: "Central", index: 0, style: { valign: 6, halign: 4, orientation: 100 }, creatorId: 0, type: 0 },
      // listed out of order: `index`, not the list, orders the siblings
      { version: 42, id: "b", parentId: "root", nextId: "a", title: "Watch", multimediaUrl: "https://youtu.be/x", mediaType: 1, index: 1, style: { expanded: true, orientation: 0 }, type: 0 },
      { version: 42, id: "a", parentId: "root", previousId: "b", title: "Plan\non two lines", index: 0, style: { expanded: false, orientation: 0 }, type: 0 },
      { version: 42, id: "deep", parentId: "a", title: "Deep", index: 0, style: { expanded: true }, type: 0 },
      { version: 42, id: "gone", parentId: "root", deleted: true, title: "Deleted", index: 2, type: 0 },
      { version: 42, id: "gc", parentId: "gone", title: "Under the deleted", index: 0, type: 0 },
      { version: 42, id: "sheet2", title: "Second sheet", index: 0, style: { expanded: true }, type: 0 }, // parentless: its own sheet
    ],
    [{ version: 40, id: "r1", fromNodeId: "deep", toNodeId: "b", ctrlX1: "0", ctrlY1: "0", ctrlX2: "0", ctrlY2: "0", width: "1", type: "1" }],
  );
  const roots = await fromMindomoBytes(bytes);
  expect(roots.map((r) => r.text)).toEqual(["Central", "Second sheet"]); // the rootId tree first, then any other parentless topic
  const [root] = roots;
  expect(root.title).toBe("Test map"); // the map's name labels the sheet
  expect(root.children.map((c) => c.text)).toEqual(["Plan\non two lines", "Watch"]); // by index, newlines kept
  expect(root.children[0].collapsed).toBe(true); // style.expanded === false
  expect(root.children[0].children[0].text).toBe("Deep");
  expect(root.children[1].link).toBe("https://youtu.be/x"); // a media address opens as a link
  expect(root.rels).toHaveLength(1);
  expect(root.rels![0].from).toBe(root.children[0].children[0].id); // remapped to our topic ids
  expect(root.rels![0].to).toBe(root.children[1].id);
});

test("refuses what is not a Mindomo map", async () => {
  await expect(fromMindomoBytes(new TextEncoder().encode('<?xml version="1.0"?><mo:map/>'))).rejects.toThrow(/older Mindomo XML/);
  await expect(fromMindomoBytes(zip({ "document.json": "{}" }))).rejects.toThrow(/nodes.json/); // not this format's parts
  const orphan = mom([{ id: "x", parentId: "ghost", title: "Orphan", index: 0 }]);
  await expect(fromMindomoBytes(orphan)).rejects.toThrow(/parent/);
  const empty = mom([]);
  await expect(fromMindomoBytes(empty)).rejects.toThrow(/no topic/);
});

test("writes a .mom Mindomo can open again", async () => {
  const root: Node = {
    ...mk("Central\ntopic"),
    link: "https://example.org",
    children: [mk("Child"), { ...mk("Folded"), collapsed: true, children: [mk("Grand")] }],
  };
  root.rels = [{ id: crypto.randomUUID(), from: root.children[1].children[0].id, to: root.children[0].id }];
  const bytes = toMindomo([root, mk("Second sheet")]);
  expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // a zip
  const parts = await unzip(bytes);
  expect([...parts.keys()].sort()).toEqual(["Document.xml", "changes.json", "document.json", "nodes.json", "relations.json", "themes.json"]);
  const doc = JSON.parse(new TextDecoder().decode(parts.get("document.json")!));
  const nodes = JSON.parse(new TextDecoder().decode(parts.get("nodes.json")!)) as Record<string, unknown>[];
  expect(nodes[0].id).toBe(doc.mapInfo.rootId); // the first sheet is the map
  expect(doc.mapInfo.name).toBe("Central\ntopic");
  expect(nodes[0].parentId).toBeUndefined(); // the root has no parent
  expect("expanded" in (nodes[0].style as object)).toBe(false);
  expect(nodes[1].nextId).toBe(nodes[2].id); // siblings are chained
  expect(nodes[2].previousId).toBe(nodes[1].id);
  expect((nodes[2].style as { expanded?: boolean }).expanded).toBe(false); // folded stays folded
  expect(nodes[4].id).toHaveLength(32); // ids like Mindomo's: 32 hex characters
  const back = await fromMindomoBytes(bytes);
  expect(back.map((r) => r.text)).toEqual(["Central\ntopic", "Second sheet"]); // one map per sheet, newlines kept
  const [r] = back;
  expect(r.link).toBe("https://example.org");
  expect(r.children[1].collapsed).toBe(true);
  expect(r.rels).toHaveLength(1);
  expect(r.rels![0].from).toBe(r.children[1].children[0].id);
  expect(r.rels![0].to).toBe(r.children[0].id);
});

test("no relationships, no relations.json", async () => {
  const bytes = toMindomo([mk("Only")]);
  const parts = await unzip(bytes);
  expect(parts.has("relations.json")).toBe(false); // the part is left out when the map has no relationship lines
  const back = await fromMindomoBytes(bytes);
  expect(back[0].rels).toBeUndefined();
  expect(back[0].text).toBe("Only");
});
