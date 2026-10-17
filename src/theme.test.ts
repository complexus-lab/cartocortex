import { expect, test } from "vitest";
import { clone, mk } from "./model";
import { CUSTOM_DEFAULT, customColors, customTheme } from "./theme";

test("customColors always returns seven valid colours", () => {
  expect(customColors()).toEqual(CUSTOM_DEFAULT);
  expect(customColors([])).toEqual(CUSTOM_DEFAULT);
  const mixed = customColors(["#112233", "red", '#123456" onload="x', "#abcdef"]);
  expect(mixed.slice(0, 4)).toEqual(["#112233", CUSTOM_DEFAULT[1], CUSTOM_DEFAULT[2], "#abcdef"]); // bad entries fall back one by one
  expect(mixed).toHaveLength(7);
  expect(customColors(Array(20).fill("#000000"))).toHaveLength(7); // extra entries are ignored
  expect(customColors("nonsense" as never)).toHaveLength(7);
});

test("customTheme has the shape of the built-in themes", () => {
  const t = customTheme(["#010203", "#111111", "#222222", "#333333", "#444444", "#555555", "#666666"]);
  expect(t).toEqual({ name: "Custom", root: "#010203", accent: "#010203", palette: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"] });
  expect(customTheme().palette).toHaveLength(6);
});

test("a copied topic does not carry the document's theme colours", () => {
  expect(clone({ ...mk("x"), themeColors: ["#000000"] }).themeColors).toBeUndefined();
});
