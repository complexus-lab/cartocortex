import { expect, test } from "vitest";
import { addChild, layout, mk, remove } from "./model";
import { addSummary, canSummarize, editSummary, removeSummary, summaryGeo } from "./summary";

test("summary spans sibling topics and goes stale with them", () => {
  const [a, b, c, g] = [mk("a"), mk("b"), mk("c"), mk("grandchild")];
  let r = mk("root");
  for (const n of [a, b, c]) r = addChild(r, r.id, n);
  r = addChild(r, b.id, g);

  expect(canSummarize(r, a.id, b.id)).toBe(true);
  expect(canSummarize(r, a.id, g.id)).toBe(false); // different parents
  expect(canSummarize(r, r.id, a.id)).toBe(false); // the root has no siblings

  r = addSummary(r, a.id, b.id, "AB");
  const sum = r.summaries![0];
  const boxes = layout(r);
  const geo = summaryGeo(r, boxes, sum)!;
  const by = Object.fromEntries(boxes.map((x) => [x.id, x]));

  expect(geo.y0).toBe(by[a.id].y);
  expect(geo.y1).toBe(Math.max(by[b.id].y + by[b.id].h, by[g.id].y + by[g.id].h)); // includes descendants
  expect(geo.bx).toBeGreaterThan(by[g.id].x + by[g.id].w);
  expect(geo.label.x).toBeGreaterThan(geo.bx);
  expect(by[c.id].y).toBeGreaterThan(geo.y0); // c is outside the span but still laid out

  expect(editSummary(r, sum.id, "Z").summaries![0].text).toBe("Z");
  expect(removeSummary(r, sum.id).summaries).toEqual([]);
  expect(summaryGeo(remove(r, b.id), layout(remove(r, b.id)), sum)).toBeNull(); // `to` is gone
});

import { mapSvg } from "./export";

test("export includes summaries inside the canvas", () => {
  const [a, b] = [mk("a"), mk("b")];
  let r = mk("root");
  for (const n of [a, b]) r = addChild(r, r.id, n);
  r = addSummary(r, a.id, b.id, "Both & more");
  const boxes = layout(r);
  const { svg, w } = mapSvg(r, boxes, () => "#000");
  expect(svg).toContain("Both &amp; more");
  const geo = summaryGeo(r, boxes, r.summaries![0])!;
  const vb = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) (\d+) (\d+)"/)!;
  expect(geo.label.x + geo.label.w).toBeLessThanOrEqual(Number(vb[1]) + w); // label fits in the viewBox
});
