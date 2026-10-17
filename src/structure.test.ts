import { expect, test } from "vitest";
import { Node, addChild, layout, mk, neighbour } from "./model";
import { addSummary, summaryGeo } from "./summary";
import { exportXmind, importXmindSheets } from "./xmind";

function chart(kind: Node["layout"]) {
  const [a, b, c, d] = [mk("a"), mk("b"), mk("c"), mk("d")];
  let r: Node = { ...mk("root"), layout: kind };
  for (const n of [a, d]) r = addChild(r, r.id, n);
  for (const n of [b, c]) r = addChild(r, a.id, n);
  return { r, a, b, c, d };
}

const noOverlapPerRow = (boxes: ReturnType<typeof layout>) => {
  const rows = new Map<number, typeof boxes>();
  for (const b of boxes) rows.set(b.y, [...(rows.get(b.y) ?? []), b]);
  for (const row of rows.values()) {
    const s = [...row].sort((p, q) => p.x - q.x);
    s.slice(1).forEach((b, i) => expect(b.x).toBeGreaterThanOrEqual(s[i].x + s[i].w));
  }
};

test("org chart: rows by depth, parents centred over children, rows never overlap", () => {
  const { r, a, b, c, d } = chart("down");
  const boxes = layout(r);
  const by = Object.fromEntries(boxes.map((x) => [x.id, x]));
  const cx = (id: string) => by[id].x + by[id].w / 2;
  expect(boxes.every((x) => x.flow === "down")).toBe(true);
  expect(by[r.id].y).toBeLessThan(by[a.id].y);
  expect(by[a.id].y).toBe(by[d.id].y);
  expect(by[b.id].y).toBeGreaterThan(by[a.id].y);
  expect(cx(a.id)).toBeCloseTo((cx(b.id) + cx(c.id)) / 2);
  expect(cx(r.id)).toBeCloseTo((cx(a.id) + cx(d.id)) / 2);
  noOverlapPerRow(boxes);

  // a long parent with one short child must not spill into its neighbour
  const wide = { ...mk("root"), layout: "down" as const, children: [
    { ...mk("a very long parent title that is wider than its child"), children: [mk("x")] },
    { ...mk("another rather long sibling title"), children: [mk("y")] },
  ] };
  noOverlapPerRow(layout(wide));
});

test("tree chart: one row per topic in document order, indented by depth", () => {
  const { r, a, b, c, d } = chart("tree");
  const boxes = layout(r);
  expect(boxes.map((x) => x.id)).toEqual([r.id, a.id, b.id, c.id, d.id]);
  expect(boxes.every((x) => x.flow === "tree")).toBe(true);
  boxes.slice(1).forEach((x, i) => expect(x.y).toBeGreaterThan(boxes[i].y));
  expect(boxes.map((x) => x.x)).toEqual([0, 36, 72, 72, 36]);
});

test("arrow keys follow the structure", () => {
  const o = chart("down"), t = chart("tree");
  const ob = layout(o.r), tb = layout(t.r);
  expect(neighbour(o.r, ob, o.r.id, "down")).toBe(o.a.id);
  expect(neighbour(o.r, ob, o.a.id, "right")).toBe(o.d.id);
  expect(neighbour(o.r, ob, o.b.id, "up")).toBe(o.a.id);
  expect(neighbour(o.r, ob, o.b.id, "right")).toBe(o.c.id);
  expect(neighbour(t.r, tb, t.r.id, "down")).toBe(t.a.id);
  expect(neighbour(t.r, tb, t.a.id, "down")).toBe(t.b.id); // next row, not next sibling
  expect(neighbour(t.r, tb, t.a.id, "right")).toBe(t.b.id); // first child
  expect(neighbour(t.r, tb, t.b.id, "left")).toBe(t.a.id);
});

test("summaries are only drawn in sideways layouts", () => {
  const side = chart("right"), down = chart("down");
  const s1 = addSummary(side.r, side.a.id, side.d.id), s2 = addSummary(down.r, down.a.id, down.d.id);
  expect(summaryGeo(s1, layout(s1), s1.summaries![0])).not.toBeNull();
  expect(summaryGeo(s2, layout(s2), s2.summaries![0])).toBeNull();
});

test("xmind export/import keeps the structure", async () => {
  for (const kind of ["right", "map", "down", "tree"] as const) {
    const back = await importXmindSheets(exportXmind({ ...mk("r"), layout: kind }));
    expect(back[0].layout ?? "right").toBe(kind);
  }
});
