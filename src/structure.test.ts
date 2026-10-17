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
  for (const kind of ["right", "map", "down", "tree", "fish", "line"] as const) {
    const back = await importXmindSheets(exportXmind({ ...mk("r"), layout: kind }));
    expect(back[0].layout ?? "right").toBe(kind);
  }
});

function fishbone() {
  const [a, b, c, d, a1, a1x, a2, b1] = ["a", "b", "c", "d", "a1", "a1x", "a2", "b1"].map((t) => mk(t));
  let r: Node = { ...mk("effect"), layout: "fish" };
  for (const n of [a, b, c, d]) r = addChild(r, r.id, n);
  for (const n of [a1, a2]) r = addChild(r, a.id, n);
  r = addChild(r, a1.id, a1x);
  r = addChild(r, b.id, b1);
  return { r, a, b, c, d, a1, a1x, a2, b1 };
}

test("fishbone: head on the right, topics alternate above and below the spine, nothing overlaps", () => {
  const { r, a, b, c, d, a1x, a2 } = fishbone();
  const boxes = layout(r);
  const by = Object.fromEntries(boxes.map((x) => [x.id, x]));
  const mid = (id: string) => by[id].y + by[id].h / 2;
  expect(boxes.every((x) => x.flow === "fish")).toBe(true);
  expect([by[r.id].x, mid(r.id)]).toEqual([0, 0]);
  expect([mid(a.id) < 0, mid(b.id) > 0, mid(c.id) < 0, mid(d.id) > 0]).toEqual([true, true, true, true]);
  expect(boxes.filter((x) => x.id !== r.id).every((x) => x.x + x.w <= 0)).toBe(true); // everything is left of the head
  expect(by[c.id].x).toBeLessThan(by[a.id].x); // later columns run further left
  expect(by[a.id].anchor).toEqual(by[b.id].anchor); // a and b share a column, so their bones meet the spine at the same point
  expect(by[a.id].anchor!.y).toBe(0);
  expect(by[a2.id].anchor!.y).toBe(mid(a2.id)); // a sub-topic's rib is horizontal
  expect(by[a1x.id].anchor).toBeUndefined(); // deeper rows hang off their parent
  expect(by[a1x.id].x + by[a1x.id].w).toBeLessThan(by[by[a1x.id].parent!].x);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i], q = boxes[j];
      const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
      expect(apart, `${p.id} overlaps ${q.id}`).toBe(true);
    }
});

test("fishbone: arrow keys walk the bones in document order", () => {
  const { r, a, b, a1, a2 } = fishbone();
  const boxes = layout(r);
  expect(neighbour(r, boxes, r.id, "left")).toBe(a.id);
  expect(neighbour(r, boxes, a.id, "right")).toBe(r.id);
  expect(neighbour(r, boxes, a.id, "left")).toBe(a1.id);
  expect(neighbour(r, boxes, a.id, "down")).toBe(a1.id); // next in document order
  expect(neighbour(r, boxes, a2.id, "down")).toBe(b.id);
  expect(neighbour(r, boxes, a.id, "up")).toBe(r.id); // document order: the head comes first
});

function timeline() {
  const [a, b, c, a1, a1x, a2, b1] = ["a", "b", "c", "a1", "a1x", "a2", "b1"].map((t) => mk(t));
  let r: Node = { ...mk("start"), layout: "line" };
  for (const n of [a, b, c]) r = addChild(r, r.id, n);
  for (const n of [a1, a2]) r = addChild(r, a.id, n);
  r = addChild(r, a1.id, a1x);
  r = addChild(r, b.id, b1);
  return { r, a, b, c, a1, a1x, a2, b1 };
}

test("timeline: topics sit on the line in order, stacks alternate below and above, nothing overlaps", () => {
  const { r, a, b, c, a1, a1x, a2, b1 } = timeline();
  const boxes = layout(r);
  const by = Object.fromEntries(boxes.map((x) => [x.id, x]));
  const mid = (id: string) => by[id].y + by[id].h / 2;
  expect(boxes.every((x) => x.flow === "line")).toBe(true);
  expect([by[r.id].x, mid(r.id), mid(a.id), mid(b.id), mid(c.id)]).toEqual([0, 0, 0, 0, 0]); // head and topics share the line
  expect(by[a.id].x).toBeGreaterThan(by[r.id].w);
  expect(by[a.id].x).toBeLessThan(by[b.id].x);
  expect(by[b.id].x).toBeLessThan(by[c.id].x);
  expect(by[a.id].anchor).toEqual({ x: by[r.id].w, y: 0 }); // the line runs from the head to the first topic…
  expect(by[b.id].anchor).toEqual({ x: by[a.id].x + by[a.id].w, y: 0 }); // …and on from each topic to the next
  // a's stack hangs below, in document order, indented by depth; b's stack goes above
  expect(by[a1.id].y).toBeGreaterThan(by[a.id].y);
  expect(by[a1x.id].y).toBeGreaterThan(by[a1.id].y);
  expect(by[a2.id].y).toBeGreaterThan(by[a1x.id].y);
  expect(by[a1.id].x).toBe(by[a.id].x + 24);
  expect(by[a1x.id].x).toBe(by[a1.id].x + 24);
  expect(by[b1.id].y).toBeLessThan(by[b.id].y);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i], q = boxes[j];
      expect(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${p.id} overlaps ${q.id}`).toBe(true);
    }
});

test("timeline: arrow keys run along the line and into the stacks", () => {
  const { r, a, b, c, a1, a1x, a2, b1 } = timeline();
  const boxes = layout(r);
  const go = (from: string, dir: "left" | "right" | "up" | "down") => neighbour(r, boxes, from, dir);
  expect([go(r.id, "right"), go(a.id, "right"), go(b.id, "right"), go(c.id, "right")]).toEqual([a.id, b.id, c.id, c.id]);
  expect([go(c.id, "left"), go(b.id, "left"), go(a.id, "left"), go(r.id, "left")]).toEqual([b.id, a.id, r.id, r.id]);
  expect([go(a.id, "down"), go(a.id, "up")]).toEqual([a1.id, a.id]); // a's stack hangs below
  expect([go(b.id, "up"), go(b.id, "down")]).toEqual([b1.id, b.id]); // b's stack goes above
  expect([go(a1.id, "down"), go(a1x.id, "down"), go(a2.id, "down")]).toEqual([a1x.id, a2.id, a2.id]); // outward, stopping at the end of the stack
  expect([go(a2.id, "up"), go(a1.id, "up")]).toEqual([a1x.id, a.id]); // inward, back to the topic
  expect([go(a1.id, "left"), go(a.id, "down")]).toEqual([a.id, a1.id]);
});
