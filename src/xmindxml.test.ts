import { expect, test } from "vitest";
import { importXmindSheets, zip } from "./xmind";
import { layoutOf, parseXml, sheetsFromXml } from "./xmindxml";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink" version="2.0">
  <!-- a comment -->
  <sheet id="s1">
    <topic id="r" structure-class="org.xmind.ui.map.clockwise">
      <title>Central &amp; co &#233;</title>
      <children>
        <topics type="attached">
          <topic id="a" xlink:href="https://example.com/?a=1&amp;b=2" branch="folded">
            <title>A</title>
            <notes><plain>note a</plain><html><xhtml:p>note a</xhtml:p></html></notes>
            <marker-refs><marker-ref marker-id="priority-2"/><marker-ref marker-id="task-half"/><marker-ref marker-id="flag-red"/></marker-refs>
            <children><topics type="attached"><topic id="a1"><title><![CDATA[A <1>]]></title></topic></topics></children>
          </topic>
          <topic id="b"><title>B</title></topic>
        </topics>
        <topics type="detached"><topic id="f"><title>floating</title></topic></topics>
      </children>
    </topic>
    <title>Sheet One</title>
  </sheet>
  <sheet id="s2"><topic id="r2" structure-class="org.xmind.ui.org-chart.down"><title>Second</title></topic><title>Org</title></sheet>
</xmap-content>`;

test("parseXml: attributes, namespaces, entities, CDATA, comments", () => {
  const x = parseXml('<?xml version="1.0"?><a:r x:k="v&quot;1" j=\'2\'><!-- c --><b/>t&lt;<c><![CDATA[<z>]]></c></a:r>');
  expect(x.name).toBe("r");
  expect(x.attrs).toEqual({ k: 'v"1', j: "2" });
  expect(x.text).toBe("t<");
  expect(x.children.map((c) => [c.name, c.text])).toEqual([["b", ""], ["c", "<z>"]]);
  expect(parseXml('<a q="x>y"/>').attrs.q).toBe("x>y"); // '>' inside a quoted attribute value
});

test("parseXml refuses DOCTYPEs and malformed input", () => {
  expect(() => parseXml('<!DOCTYPE a [<!ENTITY e "x">]><a>&e;</a>')).toThrow("DOCTYPE");
  for (const bad of ["<a><b></a></b>", "<a>", "</a>", "<a", "", "<a><!-- x </a>", "plain text"]) expect(() => parseXml(bad)).toThrow();
  expect(parseXml("<a>&unknown; &#xZZ; &#0;</a>").text).toBe("&unknown; &#xZZ; &#0;"); // unknown references stay as text
});

test("sheetsFromXml maps an XMind 8 document", () => {
  const [one, two] = sheetsFromXml(SAMPLE);
  expect(one).toMatchObject({ text: "Central & co é", title: "Sheet One", layout: "map" });
  expect(one.children.map((c) => c.text)).toEqual(["A", "B"]); // the detached (floating) topic is dropped
  expect(one.children[0]).toMatchObject({ link: "https://example.com/?a=1&b=2", note: "note a", collapsed: true, priority: 2, progress: 50 });
  expect(one.children[0].children[0].text).toBe("A <1>");
  expect(one.children[1].collapsed).toBeUndefined();
  expect(two).toMatchObject({ text: "Second", title: "Org", layout: "down" });
  expect(() => sheetsFromXml("<xmap-content/>")).toThrow("no sheet found");
});

test("layoutOf", () => {
  expect(["org.xmind.ui.fishbone.leftHeaded", "org.xmind.ui.org-chart.down", "org.xmind.ui.tree.right", "org.xmind.ui.map.clockwise", "org.xmind.ui.logic.right", "org.xmind.ui.matrix"].map(layoutOf))
    .toEqual(["fish", "down", "tree", "map", undefined, undefined]);
});

test("a zip with only content.xml opens; content.json wins when both exist", async () => {
  const legacy = await importXmindSheets(zip({ "content.xml": SAMPLE }));
  expect(legacy.map((r) => r.text)).toEqual(["Central & co é", "Second"]);
  const stub = "<xmap-content><sheet><topic><title>This file needs XMind 2020 or later</title></topic></sheet></xmap-content>";
  const both = await importXmindSheets(zip({ "content.xml": stub, "content.json": JSON.stringify([{ id: "x", class: "sheet", title: "J", rootTopic: { id: "t", title: "from json" } }]) }));
  expect(both.map((r) => r.text)).toEqual(["from json"]);
  await expect(importXmindSheets(zip({ "other.txt": "x" }))).rejects.toThrow("not an XMind file");
});
