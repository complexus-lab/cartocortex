import { expect, test } from "vitest";
import { UNSAVED_KEY, clearTab, leftTabs, saveTab, setUnsaved, wasUnsaved } from "./recovery";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

test("the unsaved flag round-trips", () => {
  const s = memory();
  expect(wasUnsaved(s)).toBe(false);
  setUnsaved(true, s);
  expect(s.m.get(UNSAVED_KEY)).toBe("1");
  expect(wasUnsaved(s)).toBe(true);
  setUnsaved(false, s);
  expect(wasUnsaved(s)).toBe(false);
});

test("a throwing store is treated as nothing to recover", () => {
  const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  expect(() => setUnsaved(true, bad)).not.toThrow();
  expect(wasUnsaved(bad)).toBe(false);
});

const scannable = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
    get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null,
  };
};

test("unsaved tabs are listed in id order, and only while they are saved", () => {
  const s = scannable();
  s.setItem("mindmap.autosave", "{}"); // the first tab's own autosave is not a left tab
  s.setItem("mindmap.autosave.tab.x", "{}"); // malformed id
  saveTab(3, "three", s); saveTab(1, "one", s); saveTab(2, "two", s);
  clearTab(2, s);
  expect(leftTabs(s)).toEqual([{ id: 1, json: "one" }, { id: 3, json: "three" }]);
});

test("a throwing store lists nothing", () => {
  const bad = { getItem: () => null, setItem: () => { throw new Error("full"); }, removeItem: () => {}, get length(): number { throw new Error("blocked"); }, key: () => null };
  expect(() => saveTab(1, "x", bad)).not.toThrow();
  expect(leftTabs(bad)).toEqual([]);
});
