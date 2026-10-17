import { expect, test } from "vitest";
import { addChild, addSibling, layout, mk, moveTo, remove, toMarkdown } from "./model";

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
