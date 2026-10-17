import { expect, test } from "vitest";
import { addChild, clone, layout, mk, neighbour, patch, search, visibleIds } from "./model";
import { exportXmind, importXmind } from "./xmind";

const sample = () => {
  let r = mk("root");
  const [a, b, c] = [mk("a"), mk("b"), mk("c")];
  r = addChild(r, r.id, a);
  r = addChild(r, r.id, b);
  r = addChild(r, a.id, c);
  return { r, a, b, c };
};

test("map layout mirrors later branches to the left and navigates across the root", () => {
  const { r, a, b, c } = sample();
  const m = { ...r, layout: "map" as const };
  const boxes = layout(m);
  const by = Object.fromEntries(boxes.map((x) => [x.id, x]));
  expect([by[a.id].side, by[b.id].side]).toEqual([1, -1]);
  expect(by[b.id].x + by[b.id].w).toBeLessThan(by[r.id].x);
  expect(by[b.id].y).toBe(by[r.id].y);
  expect([by[a.id].branch, by[b.id].branch, by[c.id].branch]).toEqual([0, 1, 0]);
  expect(neighbour(m, boxes, r.id, "left")).toBe(b.id);
  expect(neighbour(m, boxes, r.id, "right")).toBe(a.id);
  expect(neighbour(m, boxes, b.id, "right")).toBe(r.id); // towards the root from the left side
});

test("clone, search, visibleIds", () => {
  const { r, a, c } = sample();
  const doc = patch(patch(r, c.id, { note: "Needle" }), r.id, { rels: [{ id: "x", from: a.id, to: c.id }] });
  const copy = clone(doc);
  expect(copy.id).not.toBe(doc.id);
  expect(copy.rels).toBeUndefined();
  expect(search(doc, "needle")).toEqual([c.id]);
  expect(visibleIds(patch(doc, a.id, { collapsed: true }))).not.toContain(c.id);
});

test("xmind round trip keeps text, notes, links, folding and structure", async () => {
  const { r, a } = sample();
  const doc = patch(patch(r, a.id, { note: "hi", link: "http://x", collapsed: true }), r.id, { layout: "map" });
  const back = await importXmind(exportXmind(doc));
  expect(back.layout).toBe("map");
  expect(back.children[0]).toMatchObject({ text: "a", note: "hi", link: "http://x", collapsed: true });
  expect(back.children[0].children[0].text).toBe("c");
  expect(back.children[1].text).toBe("b");
});
