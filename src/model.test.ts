import { expect, test } from "vitest";
import { addChild, addSibling, layout, mapSides, mk, moveTo, Node, remove, toMarkdown } from "./model";

test("tree ops, layout, markdown", () => {
  const [a, b, c] = [mk("a"), mk("b"), mk("c")];
  let r = mk("root");
  r = addChild(r, r.id, a);
  r = addSibling(r, a.id, b);
  r = addChild(r, a.id, c);
  expect(r.children.map((n) => n.text)).toEqual(["a", "b"]);

  expect(moveTo(r, a.id, c.id)).toBe(r); // cannot move into own subtree
  const moved = moveTo(r, c.id, b.id);
  expect(moved.children[1].children[0].text).toBe("c");
  expect(remove(moved, b.id).children).toHaveLength(1);

  const boxes = layout(r);
  expect(boxes).toHaveLength(4);
  expect(boxes[0].id).toBe(r.id); // parent precedes children
  const byId = Object.fromEntries(boxes.map((x) => [x.id, x]));
  expect(byId[b.id].y).toBeGreaterThan(byId[c.id].y); // b sits below a's subtree
  expect(byId[a.id].y).toBe(byId[c.id].y); // single child is centred on its parent
  expect(toMarkdown(r)).toBe("- root\n  - a\n    - c\n  - b\n");
});

test("a two-sided map honours the side given to a topic and balances the others", () => {
  const kid = (text: string, side?: "left" | "right"): Node => ({ ...mk(text), ...(side ? { side } : {}) });
  const drawn = (r: Node) => Object.fromEntries(layout(r).filter((b) => b.depth === 1).map((b) => [r.children.find((c) => c.id === b.id)!.text, b.side]));
  const root = (layoutName: "map" | "map-ccw", ...children: Node[]): Node => ({ ...mk("R"), layout: layoutName, children });

  expect(mapSides(root("map", kid("a"), kid("b"), kid("c"))).map((s) => s.map((k) => k.text))).toEqual([["a", "b"], ["c"]]); // no side given: the first half right
  expect(mapSides(root("map-ccw", kid("a"), kid("b"), kid("c"))).map((s) => s.map((k) => k.text))).toEqual([["c"], ["a", "b"]]); // anticlockwise: the first half left

  const uneven = root("map", kid("a", "left"), kid("b", "left"), kid("c", "left"), kid("d", "right"), kid("e"), kid("f"));
  expect(drawn(uneven)).toEqual({ a: -1, b: -1, c: -1, d: 1, e: 1, f: 1 }); // e and f go to the side that holds fewer
  expect(drawn({ ...uneven, layout: "map-ccw" })).toEqual({ a: -1, b: -1, c: -1, d: 1, e: 1, f: 1 }); // a side is the one drawn, in the mirror image too
  expect(drawn(root("map", kid("a", "left"), kid("b", "left")))).toEqual({ a: -1, b: -1 }); // nothing on the right is fine
  expect(drawn({ ...uneven, layout: "right" })).toEqual({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 }); // other structures ignore it

  const moved = moveTo(uneven, uneven.children[0].id, uneven.children[3].id);
  expect(moved.children[2].children[0].side).toBeUndefined(); // a topic that leaves the top level forgets its side
});
