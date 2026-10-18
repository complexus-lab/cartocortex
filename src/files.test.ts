import { afterEach, expect, test } from "vitest";
import { bookJson, parseBook } from "./book";
import { baseName, docBytes, extOf, loadRecent, parseDoc, pushRecent, saveRecent, writeSafely } from "./files";
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

const fakeFs = (failOn: "none" | "tmp" | "rename") => {
  const files = new Map<string, string>([["/d/a.json", "old"]]);
  const dec = (b: Uint8Array) => new TextDecoder().decode(b);
  return {
    files,
    writeFile: async (p: string, b: Uint8Array) => {
      if (failOn === "tmp" && p.endsWith(".tmp")) throw new Error("denied");
      files.set(p, dec(b));
    },
    rename: async (a: string, b: string) => {
      if (failOn === "rename") throw new Error("denied");
      files.set(b, files.get(a)!);
      files.delete(a);
    },
    remove: async (p: string) => void files.delete(p),
  };
};

test("writeSafely goes through a temp file and leaves no trace", async () => {
  const fs = fakeFs("none");
  await writeSafely("/d/a.json", new TextEncoder().encode("new"), fs);
  expect([...fs.files]).toEqual([["/d/a.json", "new"]]);
});

test("writeSafely falls back to a direct write when the sibling is not allowed", async () => {
  for (const failOn of ["tmp", "rename"] as const) {
    const fs = fakeFs(failOn);
    await writeSafely("/d/a.json", new TextEncoder().encode("new"), fs);
    expect([...fs.files]).toEqual([["/d/a.json", "new"]]);
  }
});
