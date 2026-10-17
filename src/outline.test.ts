import { expect, test } from "vitest";
import { addChild, findNode, flat, indent, mk, outdent, parentOf, rename } from "./model";

test("indent / outdent / flat", () => {
  const [a, b, c] = [mk("a"), mk("b"), mk("c")];
  let r = mk("root");
  for (const n of [a, b, c]) r = addChild(r, r.id, n);

  expect(indent(r, a.id)).toBe(r); // first child has nothing to nest under
  const nested = indent(r, b.id);
  expect(parentOf(nested, b.id)!.id).toBe(a.id);

  const back = outdent(nested, b.id);
  expect(back.children.map((n) => n.text)).toEqual(["a", "b", "c"]); // lands right after its old parent
  expect(outdent(r, a.id)).toBe(r); // top-level topics cannot go further out

  expect(flat(nested).map((x) => `${x.d}${x.n.text}`)).toEqual(["0root", "1a", "2b", "1c"]);
  expect(flat({ ...nested, children: [{ ...nested.children[0], collapsed: true }, c] }).map((x) => x.n.text)).toEqual(["root", "a", "c"]);

  expect(rename(r, a.id, "a")).toBe(r); // unchanged text is a no-op, so no undo entry
  expect(findNode(rename(r, a.id, "z"), a.id)!.text).toBe("z");
});
