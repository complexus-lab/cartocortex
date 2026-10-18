import { expect, test } from "vitest";
import { UNSAVED_KEY, setUnsaved, wasUnsaved } from "./recovery";

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
