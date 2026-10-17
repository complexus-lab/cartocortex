import { afterEach, expect, test } from "vitest";
import { bookJson, parseBook } from "./book";
import { baseName, docBytes, extOf, loadRecent, parseDoc, pushRecent, saveRecent } from "./files";
import { mk } from "./model";

test("path helpers", () => {
  expect(baseName("/Users/me/maps/plan.json")).toBe("plan.json");
  expect(baseName("C:\\Users\\me\\plan.xmind")).toBe("plan.xmind");
  expect(baseName("plan.json")).toBe("plan.json");
  expect([extOf("a/b.XMIND"), extOf("a.json"), extOf("noext"), extOf("archive.tar.gz")]).toEqual(["xmind", "json", "", "gz"]);
});

test("recent files: newest first, no duplicates, capped", () => {
  expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  expect(pushRecent([], "x")).toEqual(["x"]);
  const many = Array.from({ length: 12 }, (_, i) => `f${i}`).reduce<string[]>((l, p) => pushRecent(l, p), []);
  expect(many).toHaveLength(8);
  expect(many[0]).toBe("f11");
});

test("documents are written and read in the format their extension names", async () => {
  const roots = [{ ...mk("Plan"), title: "Sheet A", children: [mk("child")] }, mk("Second")];

  const json = docBytes("/tmp/plan.json", roots, 1);
  expect(parseBook(new TextDecoder().decode(json))).toEqual({ roots, cur: 1 }); // sheet list and active sheet survive
  expect(await parseDoc("plan.json", json)).toEqual({ roots, cur: 1 });
  expect(new TextDecoder().decode(docBytes("/tmp/noext", roots, 0))).toBe(bookJson(roots, 0, true)); // unknown extension: JSON

  const xmind = docBytes("/tmp/plan.xmind", roots, 1);
  expect(new TextDecoder().decode(xmind.slice(0, 2))).toBe("PK"); // a zip
  const back = await parseDoc("plan.xmind", xmind);
  expect(back.roots.map((r) => r.text)).toEqual(["Plan", "Second"]);
  expect(back.roots[0].children[0].text).toBe("child");
  expect(back.roots[0].title).toBe("Sheet A");

  const mm = docBytes("/tmp/plan.mm", roots, 1);
  expect(new TextDecoder().decode(mm).startsWith("<?xml")).toBe(true); // FreeMind's XML, not a zip
  const backMm = await parseDoc("plan.mm", mm);
  expect(backMm.roots.map((r) => r.text)).toEqual(["Plan", "Second"]); // one root node per sheet
  expect(backMm.roots[0].children[0].text).toBe("child");

  const mmap = docBytes("/tmp/plan.mmap", roots, 1);
  expect(new TextDecoder().decode(mmap.slice(0, 2))).toBe("PK"); // a zip
  const backMmap = await parseDoc("plan.mmap", mmap);
  expect(backMmap.roots.map((r) => r.text)).toEqual(["Plan", "Second"]); // one map per sheet
  expect(backMmap.roots[0].children[0].text).toBe("child");

  const wxml = docBytes("/tmp/plan.wxml", roots, 1);
  expect(new TextDecoder().decode(wxml).startsWith("<?xml")).toBe(true); // plain XML, not a zip
  const backWxml = await parseDoc("plan.wxml", wxml);
  expect(backWxml.roots.map((r) => r.text)).toEqual(["Plan"]); // one map per file; the sheets after it open as free branches
  expect(backWxml.roots[0].children[0].text).toBe("child");
  expect(backWxml.roots[0].children.some((c) => c.float && c.text === "Second")).toBe(true);

  const mom = docBytes("/tmp/plan.mom", roots, 1);
  expect(new TextDecoder().decode(mom.slice(0, 2))).toBe("PK"); // a zip
  const backMom = await parseDoc("plan.mom", mom);
  expect(backMom.roots.map((r) => r.text)).toEqual(["Plan", "Second"]); // one map per file; the sheets after it re-open as sheets
  expect(backMom.roots[0].children[0].text).toBe("child");
});

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};
afterEach(() => store.clear());

test("the recent list survives junk in storage", () => {
  expect(loadRecent()).toEqual([]);
  saveRecent(["a", "b"]);
  expect(loadRecent()).toEqual(["a", "b"]);
  store.set("cartocortex.recent", "not json");
  expect(loadRecent()).toEqual([]);
  store.set("cartocortex.recent", JSON.stringify(["ok", 3, null, "fine"]));
  expect(loadRecent()).toEqual(["ok", "fine"]);
});
