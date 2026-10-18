import { expect, test } from "vitest";
import { Node, mk } from "./model";
import { exportXmind, importXmindReport } from "./xmind";

// 1x1 transparent PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const build = (): Node => {
  const [a, b, c, d] = ["A", "B", "C", "D"].map(mk);
  const pic = { ...mk("pic"), image: { src: PNG, w: 120, h: 80 } };
  const free = { ...mk("free"), float: { x: 210, y: -35 }, children: [mk("free kid")] };
  return {
    ...mk("root"),
    children: [a, { ...b, children: [c, d, pic] }, free],
    rels: [{ id: "rel1", from: a.id, to: d.id }, { id: "rel2", from: a.id, to: "gone" }],
    summaries: [{ id: "s1", from: c.id, to: pic.id, text: "C to pic" }, { id: "s2", from: a.id, to: a.id, text: "just A" }],
  };
};

test("relationships, summaries, floating topics and pictures survive a round trip", async () => {
  const { roots, lost } = await importXmindReport(exportXmind(build()));
  expect(lost).toEqual([]);
  const r = roots[0], [a, b, free] = r.children, [c, , pic] = b.children;
  expect(r.children.map((k) => k.text)).toEqual(["A", "B", "free"]);
  expect(free.float).toEqual({ x: 210, y: -35 });
  expect(free.children[0].text).toBe("free kid");
  expect(pic.image).toEqual({ src: PNG, w: 120, h: 80 }); // the exact bytes come back
  expect(r.rels).toEqual([{ id: expect.any(String), from: a.id, to: b.children[1].id }]); // the dangling relationship is not written
  expect(r.summaries).toEqual(expect.arrayContaining([
    { id: expect.any(String), from: c.id, to: pic.id, text: "C to pic" },
    { id: expect.any(String), from: a.id, to: a.id, text: "just A" },
  ]));
  expect(r.summaries).toHaveLength(2);
});

test("an unusable picture is left out instead of corrupting the file", async () => {
  const bad = { ...mk("root"), children: [{ ...mk("x"), image: { src: "not a data url", w: 1, h: 1 } }, { ...mk("y"), image: { src: "data:image/bmp;base64,AAAA", w: 1, h: 1 } }] };
  const { roots, lost } = await importXmindReport(exportXmind(bad));
  expect(roots[0].children.map((k) => k.image)).toEqual([undefined, undefined]);
  expect(lost).toEqual([]);
});
