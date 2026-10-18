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
  expect(roots[0].children).toHaveLength(1);
  expect(lost).toEqual(expect.arrayContaining([
    "structure map.anticlockwise opened as map",
    "2 × markers other than priority and progress dropped",
    "rich-text notes flattened to plain text",
    "topic styles other than bold, italic, strike and colour dropped",
    "images dropped", "floating topics dropped", "summaries dropped", "boundaries dropped", "relationships dropped",
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
