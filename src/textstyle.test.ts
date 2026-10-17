import { expect, test } from "vitest";
import { mapSvg } from "./export";
import { layout, mk, widthOf } from "./model";
import { hex, textStyle } from "./textstyle";
import { exportXmind, importXmind } from "./xmind";

test("hex accepts only #rrggbb", () => {
  expect(hex("#0D9488")).toBe("#0D9488");
  for (const bad of ["red", "#12345", "#1234567", '#123456" onload="x', "", undefined, 42]) expect(hex(bad)).toBeUndefined();
});

test("textStyle maps flags to CSS and drops unsafe colours", () => {
  expect(textStyle(mk("plain"))).toEqual({});
  const n = { ...mk("x"), bold: true, italic: true, strike: true, textColor: "#1e3a5f" };
  expect(textStyle(n)).toEqual({ fontWeight: 700, fontStyle: "italic", textDecoration: "line-through", color: "#1e3a5f" });
  expect(textStyle({ ...mk("x"), textColor: "red" })).toEqual({});
});

test("bold topics are laid out wider", () => {
  expect(widthOf({ ...mk("a longer topic"), bold: true })).toBeGreaterThan(widthOf(mk("a longer topic")));
});

test("xmind round trip keeps text style and refuses a bad colour", async () => {
  const doc = {
    ...mk("root"),
    children: [
      { ...mk("a"), bold: true, italic: true, strike: true, textColor: "#0d9488" },
      { ...mk("b"), textColor: "red" },
      mk("c"),
    ],
  };
  const back = await importXmind(exportXmind(doc));
  expect(back.children[0]).toMatchObject({ bold: true, italic: true, strike: true, textColor: "#0d9488" });
  expect(back.children[1].textColor).toBeUndefined();
  expect(back.children[2].bold).toBeUndefined();
});

test("svg export carries text style and escapes colours", () => {
  const r = { ...mk("root"), children: [{ ...mk("fancy"), bold: true, italic: true, strike: true, textColor: "#0d9488", color: '#fff" onload="x' }] };
  const { svg } = mapSvg(r, layout(r), (b) => (b.depth ? r.children[0].color! : "#000"));
  expect(svg).toContain('font-weight="700"');
  expect(svg).toContain('font-style="italic"');
  expect(svg).toContain('text-decoration="line-through"');
  expect(svg).toContain('fill="#0d9488">fancy');
  expect(svg).not.toContain('" onload="');
});

import { importXmindSheets, zip } from "./xmind";

test("xmind import reads numeric weights and ignores 'inherited' or malformed style values", async () => {
  const topic = (title: string, properties: Record<string, string>) => ({ id: title, title, style: { id: "s", properties } });
  const sheet = {
    id: "s", class: "sheet", title: "t",
    rootTopic: { id: "r", title: "r", children: { attached: [
      topic("a", { "fo:font-weight": "700", "fo:color": "#0D9488FF" }),
      topic("b", { "fo:font-weight": "normal", "fo:color": "inherited", "fo:font-style": "normal", "fo:text-decoration": "underline" }),
      topic("c", { "fo:font-weight": "bold", "fo:color": "rgb(1,2,3)" }),
    ] } },
  };
  const [root] = await importXmindSheets(zip({ "content.json": JSON.stringify([sheet]) }));
  expect(root.children[0]).toMatchObject({ bold: true, textColor: "#0D9488" });
  expect(root.children[1]).toEqual(expect.not.objectContaining({ bold: true }));
  expect(root.children[1].textColor).toBeUndefined();
  expect(root.children[1].strike).toBeUndefined(); // underline is not strikethrough
  expect(root.children[2]).toMatchObject({ bold: true });
  expect(root.children[2].textColor).toBeUndefined();
});
