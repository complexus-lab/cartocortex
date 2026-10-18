import { expect, test } from "vitest";
import { Report } from "./importreport";
import { importXmindReport, zip } from "./xmind";

test("Report counts repeats and keeps first-seen order", () => {
  const r = new Report();
  r.add("a"); r.add("b", 0); r.add("c", 3); r.add("a");
  expect(r.lines()).toEqual(["2 × a", "3 × c"]);
});

const json = (rootTopic: object, extra: object = {}) => zip({ "content.json": JSON.stringify([{ id: "s", class: "sheet", title: "S", rootTopic, ...extra }]) });

test("JSON import lists what it drops", async () => {
  const bytes = json(
    {
      id: "r", title: "root", structureClass: "org.xmind.ui.map.anticlockwise",
      markers: [{ markerId: "priority-1" }, { markerId: "flag-red" }, { markerId: "symbol-wrong" }],
      notes: { plain: { content: "n" }, html: { content: "<b>n</b>" } },
      style: { properties: { "fo:color": "#ff0000", "svg:fill": "#00ff00" } },
      image: { src: "x.png" },
      children: { attached: [{ id: "c", title: "kid" }], detached: [{ id: "d", title: "float" }], summary: [{ id: "m", title: "sum" }] },
      boundaries: [{ id: "b" }],
    },
    { relationships: [{ id: "rel" }] },
  );
  const { roots, lost } = await importXmindReport(bytes);
  expect(roots[0].children.map((c) => c.text)).toEqual(["kid", "float"]); // the floating topic is kept
  expect(lost).toEqual(expect.arrayContaining([
    "structure map.anticlockwise opened as map",
    "2 × markers other than priority and progress dropped",
    "rich-text notes flattened to plain text",
    "topic styles other than bold, italic, strike and colour dropped",
    "images dropped", "boundaries dropped", "relationships dropped", // the relationship has no end topics
  ]));
});

test("a clean file reports nothing", async () => {
  const { lost } = await importXmindReport(json({ id: "r", title: "root", structureClass: "org.xmind.ui.logic.right", children: { attached: [{ id: "c", title: "k" }] } }));
  expect(lost).toEqual([]);
});

test("XML import lists what it drops", async () => {
  const xml = `<xmap-content><sheet><topic id="r" structure-class="org.xmind.ui.spreadsheet.row"><title>r</title>
    <marker-refs><marker-ref marker-id="flag-red"/></marker-refs>
    <children><topics type="attached"><topic id="a"><title>a</title></topic></topics><topics type="detached"><topic id="f"><title>f</title></topic></topics></children>
    </topic><relationships><relationship id="x" end1="r" end2="a"/></relationships></sheet></xmap-content>`;
  const { lost } = await importXmindReport(zip({ "content.xml": xml }));
  expect(lost).toEqual(expect.arrayContaining([
    "structure spreadsheet.row opened as matrix", "markers other than priority and progress dropped", "floating topics dropped", "relationships dropped",
  ]));
});

test("relationships, summaries and floating topics come across", async () => {
  const { roots, lost } = await importXmindReport(json(
    {
      id: "r", title: "root",
      children: {
        attached: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }],
        summary: [{ id: "s1", title: "A and B" }],
        detached: [{ id: "f", title: "free", position: { x: 120, y: -40 } }],
      },
      summaries: [{ id: "x", range: "(0,1)", topicId: "s1" }, { id: "y", range: "(5,9)", topicId: "s1" }],
    },
    { relationships: [{ id: "q", end1Id: "a", end2Id: "c" }, { id: "z", end1Id: "a", end2Id: "gone" }] },
  ));
  const root = roots[0], [a, b, c] = root.children;
  expect(root.children.map((k) => k.text)).toEqual(["A", "B", "C", "free"]);
  expect(root.children[3].float).toEqual({ x: 120, y: -40 });
  expect(root.summaries).toEqual([{ id: expect.any(String), from: a.id, to: b.id, text: "A and B" }]);
  expect(root.rels).toEqual([{ id: expect.any(String), from: a.id, to: c.id }]);
  expect(lost).toEqual(["summaries dropped", "relationships dropped"]); // the out-of-range summary and the dangling relationship
});
