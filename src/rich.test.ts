import { expect, test } from "vitest";
import { mapSvg } from "./export";
import { clone, layout, mk, rename } from "./model";
import { DomLike, colorToHex, fromDom, runsSvg, toHtml, validRuns } from "./rich";

const txt = (s: string): DomLike => ({ nodeType: 3, nodeName: "#text", textContent: s, childNodes: [] });
const el = (tag: string, kids: DomLike[] = [], o: { color?: string; style?: DomLike["style"] } = {}): DomLike => ({
  nodeType: 1, nodeName: tag, textContent: null, childNodes: kids, getAttribute: (n) => (n === "color" ? (o.color ?? null) : null), style: o.style,
});
const root = (...kids: DomLike[]) => el("DIV", kids);

test("fromDom reads tags, nesting and merges neighbours", () => {
  expect(fromDom(root(el("B", [txt("bo")]), txt("ld")), false)).toEqual([{ t: "bo", b: true }, { t: "ld" }]);
  expect(fromDom(root(el("B", [el("I", [txt("x")]), txt("y")])), false)).toEqual([{ t: "x", b: true, i: true }, { t: "y", b: true }]);
  expect(fromDom(root(txt("a"), txt("b")), false)).toEqual([{ t: "ab" }]);
  expect(fromDom(root(el("STRIKE", [txt("gone")]), el("STRONG", [txt("!")])), false)).toEqual([{ t: "gone", s: true }, { t: "!", b: true }]);
});

test("fromDom reads colours from attributes and styles, and refuses anything else", () => {
  expect(fromDom(root(el("FONT", [txt("t")], { color: "#0D9488" })), false)).toEqual([{ t: "t", c: "#0d9488" }]);
  expect(fromDom(root(el("SPAN", [txt("t")], { style: { color: "rgb(13, 148, 136)", fontWeight: "700", fontStyle: "italic", textDecoration: "line-through" } })), false))
    .toEqual([{ t: "t", c: "#0d9488", b: true, i: true, s: true }]);
  expect(fromDom(root(el("FONT", [txt("t")], { color: "red" })), false)).toEqual([{ t: "t" }]);
  expect(colorToHex("#abc")).toBe("#aabbcc");
  expect(colorToHex('#123456" onload="x')).toBeUndefined();
});

test("fromDom line handling", () => {
  const lines = [txt("a"), el("DIV", [el("BR")]), el("DIV", [txt("b")])]; // a, blank line, b
  expect(fromDom(root(...lines), true).map((r) => r.t).join("")).toBe("a\n\nb");
  expect(fromDom(root(...lines), false).map((r) => r.t).join("")).toBe("ab"); // single line: no breaks
  expect(fromDom(root(txt("a"), el("DIV", [el("BR")])), true)).toEqual([{ t: "a" }]); // trailing newline trimmed
  expect(fromDom(root(txt("a b"), txt("\nc")), false)).toEqual([{ t: "a b c" }]); // nbsp and newline become spaces
});

test("toHtml escapes text and only emits valid colours", () => {
  expect(toHtml("a<b>&", [{ t: "a<b>&", b: true, c: "#0d9488" }], false)).toBe('<font color="#0d9488"><b>a&lt;b&gt;&amp;</b></font>');
  expect(toHtml("x", [{ t: "x", c: 'red" onload="x' }], false)).toBe("x");
  expect(toHtml("a\nb", undefined, true)).toBe("a<br>b");
});

test("runs are only valid while they spell the text", () => {
  const runs = [{ t: "he", b: true as const }, { t: "llo" }];
  expect(validRuns("hello", runs)).toBe(runs);
  expect(validRuns("hellO", runs)).toBeUndefined();
  expect(validRuns("hello", [])).toBeUndefined();
  expect(validRuns("hello", undefined)).toBeUndefined();
  const n = { ...mk("hello"), runs };
  expect(rename(n, n.id, "hello world").runs).toBeUndefined(); // editing the text elsewhere drops the styling
  expect(rename(n, n.id, "hello")).toBe(n);
  expect(clone(n).runs).toEqual(runs);
});

test("svg export draws runs as tspans, with escaping, and falls back when runs are stale", () => {
  expect(runsSvg([{ t: "a&b", b: true }, { t: " c", c: "#0d9488" }])).toBe(
    '<tspan font-weight="700">a&amp;b</tspan><tspan fill="#0d9488"> c</tspan>',
  );
  const styled = { ...mk("root"), runs: [{ t: "ro", b: true as const }, { t: "ot" }] };
  expect(mapSvg(styled, layout(styled), () => "#000").svg).toContain('<tspan font-weight="700">ro</tspan><tspan>ot</tspan>');
  const stale = { ...mk("root"), runs: [{ t: "zz", b: true as const }] };
  const svg = mapSvg(stale, layout(stale), () => "#000").svg;
  expect(svg).not.toContain("tspan");
  expect(svg).toContain(">root</text>");
});
