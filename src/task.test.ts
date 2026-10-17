import { expect, test } from "vitest";
import { normalizeUrl } from "./links";
import { mk, widthOf } from "./model";
import { prioColors, progressMarker, progressText } from "./task";
import { exportXmind, importXmind } from "./xmind";

test("normalizeUrl opens only safe schemes", () => {
  expect(normalizeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
  expect(normalizeUrl("example.com/path")).toBe("https://example.com/path"); // bare host
  expect(normalizeUrl(" localhost:3000 ")).toBe("https://localhost:3000/"); // host:port is not a scheme
  expect(normalizeUrl("mailto:me@example.com")).toBe("mailto:me@example.com");
  expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  expect(normalizeUrl("file:///etc/passwd")).toBeNull();
  expect(normalizeUrl("data:text/html,<b>x</b>")).toBeNull();
  expect(normalizeUrl("   ")).toBeNull();
  expect(normalizeUrl("http://bad host")).toBeNull();
});

test("task helpers", () => {
  expect(prioColors(1).bg).toBe("#1e3a5f");
  expect(prioColors(99).bg).toBe(prioColors(5).bg); // clamped
  expect(prioColors(0).bg).toBe(prioColors(1).bg);
  expect([0, 12, 30, 51, 99].map(progressMarker)).toEqual(["task-start", "task-oct", "task-quarter", "task-half", "task-done"]);
  expect([0, 50, 100].map(progressText)).toEqual(["0%", "50%", "✓"]);
  expect(widthOf({ ...mk("a longer topic"), priority: 2, progress: 50 })).toBe(widthOf(mk("a longer topic")) + 48);
});

test("xmind round trip keeps priority and progress", async () => {
  const doc = { ...mk("root"), children: [{ ...mk("a"), priority: 2, progress: 50 }, { ...mk("b"), progress: 100 }, mk("c")] };
  const back = await importXmind(exportXmind(doc));
  expect(back.children[0]).toMatchObject({ priority: 2, progress: 50 });
  expect(back.children[1]).toMatchObject({ progress: 100 });
  expect(back.children[1].priority).toBeUndefined();
  expect(back.children[2].progress).toBeUndefined();
});
