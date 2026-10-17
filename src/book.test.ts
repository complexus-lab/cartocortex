import { expect, test } from "vitest";
import { bookJson, parseBook, sheetTitle } from "./book";
import { mk } from "./model";
import { exportXmind, importXmindSheets } from "./xmind";

test("parseBook reads sheet lists and older single-root files", () => {
  const [a, b] = [mk("A"), mk("B")];
  const book = parseBook(bookJson([a, b], 1));
  expect(book.roots.map((r) => r.text)).toEqual(["A", "B"]);
  expect(book.cur).toBe(1);

  expect(parseBook(JSON.stringify(a))).toEqual({ roots: [a], cur: 0 }); // older file: one bare root
  expect(parseBook(bookJson([a, b], 9)).cur).toBe(1); // active index is clamped
  expect(parseBook(bookJson([a, b], -3)).cur).toBe(0);
  expect(() => parseBook('{"sheets":[]}')).toThrow("not a Cartocortex file");
  expect(() => parseBook('{"sheets":[{"id":1}]}')).toThrow("not a Cartocortex file");
  expect(() => parseBook("[]")).toThrow();
});

test("sheet title falls back to the central topic, then a number", () => {
  expect(sheetTitle({ ...mk("Plan"), title: "Q3" }, 0)).toBe("Q3");
  expect(sheetTitle(mk("Plan"), 0)).toBe("Plan");
  expect(sheetTitle(mk(""), 2)).toBe("Sheet 3");
});

test("xmind export/import keeps every sheet and its title", async () => {
  const one = { ...mk("One"), title: "First", children: [mk("x")] };
  const back = await importXmindSheets(exportXmind([one, mk("Two")]));
  expect(back.map((r) => r.text)).toEqual(["One", "Two"]);
  expect(back[0].children[0].text).toBe("x");
  expect(back.map((r, i) => sheetTitle(r, i))).toEqual(["First", "Two"]);
});
