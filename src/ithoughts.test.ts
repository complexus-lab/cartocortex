import { expect, test } from "vitest";
import { mk, Node } from "./model";
import { fromIthoughtsBytes, toIthoughts } from "./ithoughts";
import { unzip, zip } from "./xmind";

/** A small .itmz, in the shape of the files iThoughts itself writes. */
const itmz = (xml: string) => zip({ "mapdata.xml": xml });

test("reads an iThoughts map", async () => {
  const bytes = itmz(
    '<?xml version="1.0" encoding="UTF-8"?>\n<iThoughts version="4.0" app="iThoughtsX" author="me">\n<topics>\n' +
      '<topic uuid="r" text="Central" note="A note">\n' +
      '<topic uuid="a" text="Plan&#10;on two lines">\n<topic uuid="d" text="Deep"/>\n</topic>\n' +
      '<topic uuid="b" text="Watch"/>\n' +
      '</topic>\n<topic uuid="s" text="Second sheet"/>\n</topics>\n</iThoughts>\n',
  );
  const roots = await fromIthoughtsBytes(bytes);
  expect(roots.map((r) => r.text)).toEqual(["Central", "Second sheet"]); // the map's topic first, then any other at the top level
  expect(roots[0].note).toBe("A note");
  expect(roots[0].children.map((c) => c.text)).toEqual(["Plan\non two lines", "Watch"]); // file order, numeric escapes decoded
  expect(roots[0].children[0].children[0].text).toBe("Deep"); // nesting is the hierarchy
});

test("reads the wrapper-free shape as well", async () => {
  const bytes = itmz('<iThoughts><topic uuid="r" text="Only"><topic uuid="c" text="Child"/></topic></iThoughts>');
  const roots = await fromIthoughtsBytes(bytes);
  expect(roots.map((r) => r.text)).toEqual(["Only"]); // MultiMarkdown writes no <topics> wrapper
  expect(roots[0].children[0].text).toBe("Child");
});

test("refuses what is not an iThoughts map", async () => {
  await expect(fromIthoughtsBytes(new TextEncoder().encode('<?xml version="1.0"?><iThoughts/>'))).rejects.toThrow(/not an iThoughts .itmz/);
  await expect(fromIthoughtsBytes(zip({ "style.xml": "<style/>" }))).rejects.toThrow(/mapdata.xml/); // the one part the format needs is missing
  await expect(fromIthoughtsBytes(itmz("<html><body/></html>"))).rejects.toThrow(/not an iThoughts map/);
  await expect(fromIthoughtsBytes(itmz("<iThoughts><topics/></iThoughts>"))).rejects.toThrow(/no topic/);
});

test("writes an .itmz iThoughts can open again", async () => {
  const root: Node = { ...mk('Central "topic" & more'), note: "line one\nline two", children: [mk("Child"), mk("Leaf")] };
  const bytes = toIthoughts([root, mk("Second sheet")]);
  expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // a zip
  const parts = await unzip(bytes);
  expect([...parts.keys()]).toEqual(["mapdata.xml"]); // the one part iThoughts needs
  const xml = new TextDecoder().decode(parts.get("mapdata.xml")!);
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<iThoughts>\n<topics>\n')).toBe(true);
  expect(xml).toContain('<topic uuid="'); // iThoughts' own topics carry a uuid
  expect(xml).toContain('text="Central &quot;topic&quot; &amp; more"'); // attribute escapes
  expect(xml).toContain('note="line one&#10;line two"'); // a line break inside a note
  expect(xml).toContain('text="Leaf"/>'); // a leaf closes itself
  const back = await fromIthoughtsBytes(bytes);
  expect(back.map((r) => r.text)).toEqual(['Central "topic" & more', "Second sheet"]);
  expect(back[0].note).toBe("line one\nline two");
  expect(back[0].children.map((c) => c.text)).toEqual(["Child", "Leaf"]);
});
