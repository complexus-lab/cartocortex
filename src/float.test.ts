import { expect, test } from "vitest";
import { addChild, clone, findNode, layout, mk, moveAll, neighbour, parentOf } from "./model";

function doc() {
  const [a, b, f, g] = [mk("a"), mk("b"), { ...mk("free"), float: { x: 500, y: 300 } }, mk("free child")];
  let r = mk("root");
  for (const n of [a, f, b]) r = addChild(r, r.id, n); // the floating topic sits between a and b
  r = addChild(r, f.id, g);
  return { r, a, b, f, g };
}

test("floating topics sit at their position and leave the tree layout alone", () => {
  const { r, a, b, f, g } = doc();
  const by = Object.fromEntries(layout(r).map((x) => [x.id, x]));
  expect(by[f.id]).toMatchObject({ x: 500, y: 300, depth: 1, branch: 1 });
  expect(by[f.id].parent).toBeUndefined(); // no branch drawn to the root
  expect(by[g.id].parent).toBe(f.id);
  expect(by[g.id].x).toBeGreaterThan(by[f.id].x + by[f.id].w);

  const plain = Object.fromEntries(layout({ ...r, children: [a, b] }).map((x) => [x.id, x]));
  for (const id of [r.id, a.id, b.id]) expect([by[id].x, by[id].y]).toEqual([plain[id].x, plain[id].y]);
  expect(by[b.id].branch).toBe(2); // index among all top-level topics, floating ones included
});

test("dropping a floating topic onto another attaches it; copies never float", () => {
  const { r, a, f } = doc();
  const attached = moveAll(r, [f.id], a.id);
  expect(parentOf(attached, f.id)!.id).toBe(a.id);
  expect(findNode(attached, f.id)!.float).toBeUndefined();
  expect(layout(attached).find((x) => x.id === f.id)!.parent).toBe(a.id);
  expect(clone(f).float).toBeUndefined();
});

test("arrow-right from the root skips floating topics", () => {
  const { r, a } = doc();
  expect(neighbour(r, layout(r), r.id, "right")).toBe(a.id);
});
