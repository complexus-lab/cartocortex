import { expect, test } from "vitest";
import { addChild, findNode, mk, moveAll, parentOf, patchAll, removeAll } from "./model";
import { siblingSpan } from "./summary";

function tree() {
  const [a, b, c, d, a1] = [mk("a"), mk("b"), mk("c"), mk("d"), mk("a1")];
  let r = mk("root");
  for (const n of [a, b, c, d]) r = addChild(r, r.id, n);
  r = addChild(r, a.id, a1);
  return { r, a, b, c, d, a1 };
}

test("bulk patch and remove", () => {
  const { r, a, b, c } = tree();
  const red = patchAll(r, [a.id, c.id], { color: "#f00" });
  expect(findNode(red, a.id)!.color).toBe("#f00");
  expect(findNode(red, b.id)!.color).toBeUndefined();
  expect(removeAll(r, [a.id, c.id]).children.map((n) => n.text)).toEqual(["b", "d"]);
});

test("bulk move keeps order, nests under target, ignores descendants of moved topics", () => {
  const { r, a, b, c, d, a1 } = tree();
  const moved = moveAll(r, [a.id, a1.id, c.id], d.id); // a1 rides along with a
  expect(moved.children.map((n) => n.text)).toEqual(["b", "d"]);
  expect(findNode(moved, d.id)!.children.map((n) => n.text)).toEqual(["a", "c"]);
  expect(parentOf(moved, a1.id)!.id).toBe(a.id);

  const into = moveAll(r, [a.id, b.id], a.id); // a cannot drop into itself, b still moves
  expect(into.children.map((n) => n.text)).toEqual(["a", "c", "d"]);
  expect(findNode(into, a.id)!.children.map((n) => n.text)).toEqual(["a1", "b"]);
});

test("sibling span of a selection", () => {
  const { r, a, b, c, d, a1 } = tree();
  expect(siblingSpan(r, [d.id, b.id])).toEqual([b.id, d.id]); // order of selection does not matter
  expect(siblingSpan(r, [a.id, a1.id])).toBeNull(); // different parents
  expect(siblingSpan(r, [c.id])).toBeNull(); // needs at least two
  expect(siblingSpan(r, [r.id, a.id])).toBeNull();
});
