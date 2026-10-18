import { expect, test } from "vitest";
import { mk, Node } from "./model";
import { fromSimplemindBytes, toSimplemind } from "./simplemind";
import { unzip, zip } from "./xmind";

/** A small .smmx, in the shape of the files SimpleMind itself writes, byte-order mark and DOCTYPE included. */
const smmx = (xml: string) => zip({ "document/mindmap.xml": xml });

test("reads a SimpleMind map", async () => {
  const bytes = smmx(
    '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE simplemind-mindmaps>\n' +
      '<simplemind-mindmaps doc-version="3" generator="SimpleMindOSXN" gen-version="2.8.2">\n<mindmap>\n' +
      '<meta><guid guid="g"/><title text="My map"/></meta>\n<topics>\n' +
      '<topic id="0" parent="-1" guid="a" text="Central\\Nwith a break" textfmt="plain">\n' +
      '<note textfmt="plain">A note</note>\n<link urllink="https://example.com"/>\n</topic>\n' +
      '<topic id="1" parent="0" guid="b" text="Plan" textfmt="plain" checkbox="true" progress="50"/>\n' +
      '<topic id="2" parent="0" guid="c" text="Watch" textfmt="plain"/>\n' +
      '</topics>\n<relations><relation source="1" target="2"/></relations>\n</mindmap>\n</simplemind-mindmaps>\n',
  );
  const roots = await fromSimplemindBytes(bytes);
  expect(roots.map((r) => r.text)).toEqual(["Central\nwith a break"]); // the flat list's root, "\N" decoded
  expect(roots[0].title).toBe("My map"); // the map's own name labels the sheet
  expect(roots[0].note).toBe("A note");
  expect(roots[0].link).toBe("https://example.com");
  expect(roots[0].children.map((c) => c.text)).toEqual(["Plan", "Watch"]); // file order; the parent ids give the tree
  expect(roots[0].children[0].progress).toBe(50); // a task checkbox
  expect(roots[0].rels?.length).toBe(1); // a relation between the two children
  expect(roots[0].rels![0].from).toBe(roots[0].children[0].id);
  expect(roots[0].rels![0].to).toBe(roots[0].children[1].id);
});

test("reads every mindmap of the file", async () => {
  const bytes = smmx(
    "<simplemind-mindmaps><mindmap><topics>" +
      '<topic id="0" parent="-1" text="First"/></topics></mindmap>' +
      "<mindmap><topics>" +
      '<topic id="0" parent="-1" text="Second"/></topics></mindmap></simplemind-mindmaps>',
  );
  const roots = await fromSimplemindBytes(bytes);
  expect(roots.map((r) => r.text)).toEqual(["First", "Second"]); // one sheet per mindmap
});

test("refuses what is not a SimpleMind map", async () => {
  await expect(fromSimplemindBytes(new TextEncoder().encode('<?xml version="1.0"?><simplemind-mindmaps/>'))).rejects.toThrow(/not a SimpleMind .smmx/);
  await expect(fromSimplemindBytes(zip({ "document/other.xml": "<x/>" }))).rejects.toThrow(/mindmap\.xml/); // the one part the format needs is missing
  await expect(fromSimplemindBytes(smmx("<html><body/></html>"))).rejects.toThrow(/not a SimpleMind map/);
  await expect(fromSimplemindBytes(smmx("<simplemind-mindmaps><mindmap><topics/></mindmap></simplemind-mindmaps>"))).rejects.toThrow(/no topic/);
});

test("writes an .smmx SimpleMind can open again", async () => {
  const plan = { ...mk("Child"), children: [mk("Leaf")] };
  const root: Node = {
    ...mk('Central "topic"\n& more'),
    note: "line one\nline two",
    link: "https://example.com",
    progress: 50,
    children: [plan, mk("Watch")],
  };
  root.rels = [{ id: crypto.randomUUID(), from: plan.id, to: root.children[1].id }];
  const bytes = toSimplemind([root, mk("Second sheet")]);
  expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // a zip
  const parts = await unzip(bytes);
  expect([...parts.keys()]).toEqual(["document/mindmap.xml"]); // the one part SimpleMind needs
  const xml = new TextDecoder().decode(parts.get("document/mindmap.xml")!);
  expect(xml.startsWith("\uFEFF<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE simplemind-mindmaps>\n")).toBe(true); // the shape SimpleMind itself writes
  expect(xml).toContain('<topic id="0" parent="-1"'); // a flat list, the root pointing at no parent
  expect(xml).toContain('text="Central &quot;topic&quot;\\N&amp; more"'); // attribute escapes, "\N" for the line break
  expect(xml).toContain('checkbox="true" progress="50"'); // a task checkbox
  expect(xml).toContain("<note>line one\\Nline two</note>"); // a line break inside a note
  expect(xml).toContain('<link urllink="https://example.com"/>');
  expect(xml).toContain('<relation source="1" target="3"/>'); // the relation joins the two top-level children
  const back = await fromSimplemindBytes(bytes);
  expect(back.map((r) => r.text)).toEqual(['Central "topic"\n& more', "Second sheet"]);
  expect(back[0].children.map((c) => c.text)).toEqual(["Child", "Watch"]);
  expect(back[0].children[0].children[0].text).toBe("Leaf");
  expect(back[0].note).toBe("line one\nline two");
  expect(back[0].progress).toBe(50);
  expect(back[0].rels?.[0].from).toBe(back[0].children[0].id);
});
