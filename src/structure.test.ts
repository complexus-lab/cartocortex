import { expect, test } from "vitest";
import { Node, addChild, layout, mk, neighbour } from "./model";
import { addSummary, summaryGeo } from "./summary";
import { exportXmind, importXmindReport, importXmindSheets } from "./xmind";

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
  for (const kind of ["right", "left", "map", "down", "tree", "fish", "line", "brace", "matrix", "up", "tree-left", "brace-left", "fish-left", "map-ccw", "vline", "matrix-row"] as const) {
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

import { braces } from "./export";

function sideways(kind: Node["layout"]) {
  const [a, b, c, a1, a2, a3] = ["a", "b", "c", "a1", "a2", "a3"].map((t) => mk(t));
  let r: Node = { ...mk("root"), layout: kind };
  for (const n of [a, b, c]) r = addChild(r, r.id, n);
  for (const n of [a1, a2, a3]) r = addChild(r, a.id, n);
  return { r, a, b, c, a1, a2, a3 };
}

test("logic (left) is the mirror image of logic (right)", () => {
  const right = sideways("right"), left = sideways("left");
  const rb = layout(right.r), lb = layout(left.r);
  expect(lb.every((x) => x.flow === "right")).toBe(true);
  expect(lb[0]).toMatchObject({ x: 0, w: rb[0].w }); // the root stays at x = 0
  rb.slice(1).forEach((x, i) => {
    const m = lb[i + 1];
    expect(m.side).toBe(-1);
    expect(m.y - lb[0].y).toBe(x.y - rb[0].y); // same rows, relative to the root
    expect(m.x + m.w).toBeLessThanOrEqual(0); // everything is left of the root
    expect(rb[0].w - x.x - x.w).toBeCloseTo(m.x); // mirrored about the root's width
  });
  expect(neighbour(left.r, lb, left.r.id, "left")).toBe(left.a.id);
  expect(neighbour(left.r, lb, left.a.id, "right")).toBe(left.r.id);
});

test("brace: same geometry as logic (right), with one curly brace per parent", () => {
  const plain = layout(sideways("right").r), { r, a } = sideways("brace"), boxes = layout(r);
  boxes.forEach((x, i) => expect([x.x, x.y, x.w]).toEqual([plain[i].x, plain[i].y, plain[i].w]));
  expect(boxes.every((x) => x.flow === "brace")).toBe(true);
  const gs = braces(boxes);
  expect(gs).toHaveLength(2); // the root's children and a's children
  const by = Object.fromEntries(boxes.map((x) => [x.id, x]));
  const rootBrace = gs.find((g) => g.id === a.id)!;
  expect(rootBrace.d.startsWith(`M${by[r.id].x + by[r.id].w} `)).toBe(true); // the stem leaves the parent's right edge
  expect(rootBrace.d).toContain("Q"); // three rows: a real curly brace
  expect(braces(layout({ ...sideways("brace").r, children: [mk("only")] }))[0].d).not.toContain("Q"); // a single row: a plain line
  expect(braces(layout(sideways("right").r))).toEqual([]); // other structures draw no braces
});

test("matrix: topics along the top, every stack below, nothing overlaps", () => {
  const { r, a, b, c, a1, a2, a3 } = sideways("matrix");
  const boxes = layout(r);
  const by = Object.fromEntries(boxes.map((x) => [x.id, x]));
  const mid = (id: string) => by[id].y + by[id].h / 2;
  expect(boxes.every((x) => x.flow === "matrix")).toBe(true);
  expect([mid(a.id), mid(b.id), mid(c.id)]).toEqual([0, 0, 0]);
  expect(by[a.id].x < by[b.id].x && by[b.id].x < by[c.id].x).toBe(true);
  expect(by[a1.id].y > by[a.id].y && by[a2.id].y > by[a1.id].y && by[a3.id].y > by[a2.id].y).toBe(true); // below, in order
  const b1 = mk("b1");
  const inB = Object.fromEntries(layout({ ...r, children: [a, { ...b, children: [b1] }, c] }).map((x) => [x.id, x]));
  expect(inB[b1.id].y).toBeGreaterThan(0); // the second column also hangs below (a timeline would put it above)
  expect(neighbour(r, boxes, b.id, "up")).toBe(b.id);
  expect(neighbour(r, boxes, a.id, "down")).toBe(a1.id);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i], q = boxes[j];
      expect(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${p.id} overlaps ${q.id}`).toBe(true);
    }
});

// Mirrored structures: the base layout flipped about the central topic, with connectors, braces and arrow keys following.
import { branchD } from "./export";
import { Flip, unflip } from "./model";

const sample = (kind: Node["layout"]) => {
  let r: Node = { ...mk("root"), layout: kind };
  for (const t of ["a", "b", "c"]) r = addChild(r, r.id, mk(t));
  r = addChild(r, r.children[0].id, mk("a1"));
  return r;
};

test.each([
  ["up", "down", { v: true }],
  ["tree-left", "tree", { h: true }],
  ["brace-left", "brace", { h: true }],
  ["fish-left", "fish", { h: true }],
  ["map-ccw", "map", { h: true }],
] as [Node["layout"], Node["layout"], Flip][])("%s is the mirror image of %s", (kind, base, flip) => {
  const mirrored = layout(sample(kind)), plain = layout(sample(base));
  expect(mirrored).toHaveLength(plain.length);
  for (const [i, m] of mirrored.entries()) {
    const p = plain[i];
    expect(m.flip).toEqual(flip);
    expect(m.w).toBe(p.w);
    expect(m.h).toBe(p.h);
    expect(Math.abs(unflip(m).x - p.x)).toBeLessThan(1e-9);
    expect(Math.abs(unflip(m).y - p.y)).toBeLessThan(1e-9);
  }
  const lean = (bs: ReturnType<typeof layout>, axis: "x" | "y") => {
    const size = axis === "x" ? "w" : "h";
    return Math.sign(bs.slice(1).reduce((t, b) => t + b[axis] + b[size] / 2 - (bs[0][axis] + bs[0][size] / 2), 0));
  };
  // The branches lean to the opposite side of the central topic.
  if (flip.h && kind !== "map-ccw") expect(lean(mirrored, "x")).toBe(-lean(plain, "x"));
  if (flip.v) expect(lean(mirrored, "y")).toBe(-lean(plain, "y"));
});

test("connectors of a mirrored structure are the base connectors mirrored", () => {
  const down = layout(sample("down")), up = layout(sample("up"));
  const d0 = branchD(down[1], down[0]), d1 = branchD(up[1], up[0]);
  const nums = (d: string) => d.match(/-?\d*\.?\d+/g)!.map(Number);
  const [a, b] = [nums(d0), nums(d1)];
  expect(b.length).toBe(a.length);
  b.forEach((n, i) => expect(Math.abs(n - (i % 2 === 1 ? -a[i] : a[i]))).toBeLessThan(1e-6)); // y mirrored, x kept
  const leftBrace = braces(layout({ ...sample("brace-left"), children: sample("brace-left").children.concat([mk("d"), mk("e"), mk("f")]) }));
  expect(leftBrace.length).toBeGreaterThan(0);
  expect(leftBrace[0].d).toMatch(/-/); // drawn on the negative-x side
});

test("arrow keys follow a mirrored structure", () => {
  const r = sample("tree-left"), boxes = layout(r), [a] = r.children;
  expect(neighbour(r, boxes, a.id, "right")).toBe(r.id); // towards the central topic, which now sits to the right
  expect(neighbour(r, boxes, a.id, "left")).toBe(a.children[0].id); // away from it, into the children
  const up = sample("up"), ub = layout(up);
  expect(neighbour(up, ub, up.children[0].id, "down")).toBe(up.id); // the parent is below
  expect(neighbour(up, ub, up.id, "up")).toBe(up.children[0].id);
  const ccw = sample("map-ccw"), cb = layout(ccw);
  expect(cb.find((b) => b.id === ccw.children[0].id)!.side).toBe(-1); // the first half of a map now grows leftwards
});

function vertical() {
  let r: Node = { ...mk("head"), layout: "vline" };
  const t = ["one", "two", "three", "four"].map(mk);
  for (const n of t) r = addChild(r, r.id, n);
  const kids = ["x", "y", "z"].map(mk);
  for (const k of kids) r = addChild(r, t[0].id, k); // topic one is tall: its stack must not collide with topic three on the same side
  r = addChild(r, kids[0].id, mk("deep"));
  return { r, t, kids };
}

test("vertical timeline: topics alternate sides down the line and never overlap", () => {
  const { r, t } = vertical();
  const boxes = layout(r), by = Object.fromEntries(boxes.map((b) => [b.id, b]));
  const head = boxes[0], spine = head.x + head.w / 2;
  expect(t.map((n) => by[n.id].side)).toEqual([1, -1, 1, -1]);
  for (const n of t) expect(by[n.id].side === 1 ? by[n.id].x > spine : by[n.id].x + by[n.id].w < spine).toBe(true);
  const ys = t.map((n) => by[n.id].y);
  expect(ys).toEqual([...ys].sort((a, b) => a - b)); // in order down the line
  expect(by[t[0].id].y).toBeGreaterThan(head.y + head.h);
  // no two boxes on the same side overlap
  for (const a of boxes) for (const b of boxes) {
    if (a.id < b.id && a.side === b.side && a.id !== head.id && b.id !== head.id) {
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect(apart, `${a.id} vs ${b.id}`).toBe(true);
    }
  }
  expect(boxes.every((b) => b.flow === "vline")).toBe(true);
});

test("vertical timeline: descendants grow outward and connectors run down the line", () => {
  const { r, t, kids } = vertical();
  const boxes = layout(r), by = Object.fromEntries(boxes.map((b) => [b.id, b]));
  expect(by[kids[0].id].x).toBeGreaterThan(by[t[0].id].x + by[t[0].id].w); // on the right, to the right of the topic
  const two = by[t[1].id];
  expect(branchD(two, boxes[0])).toMatch(/^M-?[\d.]+ -?[\d.]+V-?[\d.]+H-?[\d.]+$/);
  expect(branchD(two, boxes[0]).endsWith(`H${two.x + two.w}`)).toBe(true); // the left-hand topic is met at its right edge
  expect(branchD(by[kids[0].id], by[t[0].id])).toMatch(/C/); // deeper topics hang off their parent with the usual curve
});

test("vertical timeline: arrow keys run down the line and into the stacks", () => {
  const { r, t, kids } = vertical();
  const boxes = layout(r), go = (id: string, d: "left" | "right" | "up" | "down") => neighbour(r, boxes, id, d);
  expect([go(r.id, "down"), go(t[0].id, "down"), go(t[1].id, "down"), go(t[3].id, "down")]).toEqual([t[0].id, t[1].id, t[2].id, t[3].id]);
  expect([go(t[1].id, "up"), go(t[0].id, "up")]).toEqual([t[0].id, r.id]);
  expect([go(t[0].id, "right"), go(r.id, "right"), go(r.id, "left")]).toEqual([kids[0].id, t[0].id, t[1].id]); // right-hand topic into its stack; root to the first topic on each side
  expect(go(kids[0].id, "left")).toBe(t[0].id);
});

function rows() {
  let r: Node = { ...mk("head"), layout: "matrix-row" };
  const [x, y] = [mk("row X"), mk("row Y")];
  r = addChild(addChild(r, r.id, x), r.id, y);
  const cells = ["c1", "c2", "c3"].map(mk);
  for (const c of cells) r = addChild(r, x.id, c);
  const sub = ["s1", "s2"].map(mk);
  for (const s of sub) r = addChild(r, cells[0].id, s); // the first cell is tall: it widens its column, not the row above
  r = addChild(r, y.id, mk("lonely"));
  return { r, x, y, cells, sub };
}

test("row matrix: headers down the line, cells side by side, stacks under cells", () => {
  const { r, x, y, cells, sub } = rows();
  const boxes = layout(r), by = Object.fromEntries(boxes.map((b) => [b.id, b]));
  expect(boxes.every((b) => b.flow === "rmatrix")).toBe(true);
  expect(by[y.id].y).toBeGreaterThan(by[x.id].y + by[x.id].h); // rows below one another
  expect(by[x.id].x).toBe(by[y.id].x); // headers share a column
  const cy = cells.map((c) => by[c.id]);
  expect(cy.every((b) => b.y === by[x.id].y)).toBe(true); // cells sit on the header's line
  expect(cy[0].x).toBeGreaterThan(by[x.id].x + by[x.id].w);
  expect(cy[1].x).toBeGreaterThan(cy[0].x + cy[0].w);
  expect(cy[2].x).toBeGreaterThan(cy[1].x + cy[1].w);
  expect(sub.map((s) => by[s.id].y)).toEqual([...sub.map((s) => by[s.id].y)].sort((a, b) => a - b)); // stacked downwards
  expect(by[sub[0].id].y).toBeGreaterThan(cy[0].y + cy[0].h);
  expect(by[y.id].y).toBeGreaterThan(by[sub[1].id].y + H_BOX); // the next row starts below the tallest stack
  for (const a of boxes) for (const b of boxes) {
    if (a.id < b.id) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} vs ${b.id}`).toBe(true);
  }
});
const H_BOX = 34;

test("row matrix: connectors and arrow keys", () => {
  const { r, x, y, cells, sub } = rows();
  const boxes = layout(r), by = Object.fromEntries(boxes.map((b) => [b.id, b])), go = (id: string, d: "left" | "right" | "up" | "down") => neighbour(r, boxes, id, d);
  expect(branchD(by[x.id], boxes[0])).toMatch(/^M[\d.]+ [\d.]+V[\d.]+H[\d.]+$/);
  expect(branchD(by[cells[1].id], by[x.id])).toMatch(/^M[\d.]+ [\d.]+H[\d.]+$/);
  expect(branchD(by[sub[0].id], by[cells[0].id])).toMatch(/V/);
  expect([go(r.id, "down"), go(x.id, "down"), go(y.id, "up"), go(x.id, "up")]).toEqual([x.id, y.id, x.id, r.id]);
  expect([go(x.id, "right"), go(cells[0].id, "right"), go(cells[2].id, "right"), go(cells[1].id, "left"), go(cells[0].id, "left")]).toEqual([cells[0].id, cells[1].id, cells[2].id, cells[0].id, x.id]);
  expect([go(cells[0].id, "down"), go(sub[0].id, "down"), go(sub[1].id, "down"), go(sub[1].id, "up")]).toEqual([sub[0].id, sub[1].id, sub[1].id, cells[0].id]); // up from a stacked topic goes to its parent
});

// A topic can give its own branch a structure: an org chart or tree chart inside a logic chart or map.
function branched(sub: Node["layout"], rootLayout: Node["layout"] = "map") {
  let r: Node = { ...mk("root"), layout: rootLayout };
  const [a, b, c] = [mk("A"), { ...mk("B"), layout: sub }, mk("C")];
  r = addChild(addChild(addChild(r, r.id, a), r.id, b), r.id, c);
  const kids = ["b1", "b2", "b3"].map(mk);
  for (const k of kids) r = addChild(r, b.id, k);
  r = addChild(r, kids[0].id, mk("b1x"));
  r = addChild(r, a.id, mk("a1"));
  return { r, a, b, c, kids };
}

const apart = (a: ReturnType<typeof layout>[number], b: ReturnType<typeof layout>[number]) =>
  a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

test.each(["down", "up", "tree", "tree-left"] as const)("a topic's own %s structure lays its branch out on its own without collisions", (sub) => {
  for (const rootLayout of ["map", "right", "left"] as const) {
    const { r, b, kids } = branched(sub, rootLayout);
    const boxes = layout(r), by = Object.fromEntries(boxes.map((x) => [x.id, x]));
    expect(boxes).toHaveLength(9);
    for (const x of boxes) for (const y of boxes) if (x.id < y.id) expect(apart(x, y), `${sub}/${rootLayout}: ${x.id} vs ${y.id}`).toBe(true);
    const flows = { down: "down", up: "down", tree: "tree", "tree-left": "tree" } as const;
    expect(kids.every((k) => by[k.id].flow === flows[sub])).toBe(true);
    expect(by[b.id].flow).not.toBe(flows[sub]); // the topic itself stays in the sheet's structure
    if (sub === "down") expect(kids.every((k) => by[k.id].y > by[b.id].y + by[b.id].h)).toBe(true); // below the topic
    if (sub === "up") expect(kids.every((k) => by[k.id].y + by[k.id].h < by[b.id].y)).toBe(true); // above it
  }
});

test("a branch with its own structure keeps working connectors and keys, also on the left of a map", () => {
  const { r, b, kids } = branched("down", "left");
  const boxes = layout(r), by = Object.fromEntries(boxes.map((x) => [x.id, x]));
  expect(branchD(by[kids[0].id], by[b.id])).toMatch(/^M-?[\d.]+ -?[\d.]+C/); // an org chart connector from the topic's bottom
  for (const k of kids) expect(branchD(by[k.id], by[b.id]).startsWith(`M${by[b.id].x + by[b.id].w / 2} ${by[b.id].y + by[b.id].h}C`)).toBe(true); // starting at the topic itself, also in the mirrored left half
  expect(neighbour(r, boxes, b.id, "down")).toBe(kids[0].id); // into the branch
  expect(neighbour(r, boxes, kids[0].id, "up")).toBe(b.id); // and back out
  expect(neighbour(r, boxes, kids[0].id, "right")).toBe(kids[1].id);
  const tree = branched("tree", "left"), tb = layout(tree.r);
  expect(neighbour(tree.r, tb, tree.b.id, "right")).not.toBe(tree.kids[0].id); // a left-hand tree chart opens leftwards, not rightwards
  expect(neighbour(tree.r, tb, tree.b.id, "left")).toBe(tree.kids[0].id);
});

test("a branch's structure survives XMind export and import, and a topic structure the sheet cannot hold is reported", async () => {
  const { r, b } = branched("up");
  const back = await importXmindReport(exportXmind(r));
  expect(back.lost).toEqual([]);
  expect(back.roots[0].children[1].layout).toBe("up");
  expect(back.roots[0].children[0].layout).toBeUndefined();
  void b;
  const inChart = branched("up", "down"); // an org chart sheet cannot give a branch a different structure
  const lost = (await importXmindReport(exportXmind(inChart.r))).lost;
  expect(lost).toEqual(["structures set on individual topics dropped"]);
});
