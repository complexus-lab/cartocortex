import { expect, test } from "vitest";
import { mapSvg, pdfFromJpeg } from "./export";
import { Node, addChild, layout, mk } from "./model";

test("svg export escapes text and covers every visible topic", () => {
  let r: Node = mk("A & <B>");
  const c = mk("child");
  r = addChild(r, r.id, c);
  const boxes = layout(r);
  const { svg, w, h } = mapSvg(r, boxes, () => "#3b6cff");
  expect(svg).toContain("A &amp; &lt;B&gt;");
  expect(svg).not.toContain("A & <B>");
  expect(svg.match(/<text /g)).toHaveLength(2);
  expect(w).toBeGreaterThan(80);
  expect(h).toBeGreaterThan(80);
});

test("pdf has valid xref offsets", () => {
  const pdf = pdfFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 10, 10, 100, 50);
  const text = new TextDecoder("latin1").decode(pdf);
  expect(text.startsWith("%PDF-1.4")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  const rows = text.split("xref\n0 6\n")[1].split("\n").slice(1, 6);
  rows.forEach((row, i) => expect(text.slice(Number(row.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true));
  expect(Number(text.split("startxref\n")[1].split("\n")[0])).toBe(text.indexOf("xref\n0 6"));
});
