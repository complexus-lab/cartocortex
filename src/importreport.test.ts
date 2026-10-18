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
      style: { properties: { "fo:color": "#ff0000", "line-color": "#00ff00" } },
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
    "markers with no counterpart dropped",
    "rich-text notes flattened to plain text",
    "topic styles other than bold, italic, strike, text colour and fill dropped",
    "images dropped", "boundaries dropped", "relationships dropped", // the relationship has no end topics
  ]));
});

test("a clean file reports nothing", async () => {
  const { lost } = await importXmindReport(json({ id: "r", title: "root", structureClass: "org.xmind.ui.logic.right", children: { attached: [{ id: "c", title: "k" }] } }));
  expect(lost).toEqual([]);
});

test("XML import lists what it drops", async () => {
  const xml = `<xmap-content><sheet><topic id="r" structure-class="org.xmind.ui.spreadsheet.row"><title>r</title>
    <marker-refs><marker-ref marker-id="smiley-smile"/></marker-refs>
    <children><topics type="attached"><topic id="a"><title>a</title></topic></topics><topics type="detached"><topic id="f"><title>f</title></topic></topics></children>
    </topic><relationships><relationship id="x" end1="r" end2="a"/></relationships></sheet></xmap-content>`;
  const { lost } = await importXmindReport(zip({ "content.xml": xml }));
  expect(lost).toEqual(expect.arrayContaining([
    "structure spreadsheet.row opened as matrix", "markers with no counterpart dropped", "floating topics dropped", "relationships dropped",
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

test("pictures are embedded from the zip's resources", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"><rect/></svg>';
  const sheet = [{ id: "s", class: "sheet", title: "S", rootTopic: { id: "r", title: "root", children: { attached: [
    { id: "a", title: "png", image: { src: "xap:resources/a.png", width: 200, height: 133.4 } },
    { id: "b", title: "svg", image: { src: "xap:resources/b.svg" } },
    { id: "c", title: "gone", image: { src: "xap:resources/missing.png", width: 10, height: 10 } },
    { id: "d", title: "odd", image: { src: "xap:resources/d.bmp", width: 10, height: 10 } },
    { id: "e", title: "big", image: { src: "xap:resources/e.jpg", width: 10, height: 10 } },
  ] } } }];
  const { roots, lost } = await importXmindReport(zip({
    "content.json": JSON.stringify(sheet), "resources/a.png": "fakepng", "resources/b.svg": svg, "resources/d.bmp": "x", "resources/e.jpg": "z".repeat(600_000),
  }));
  const [a, b, c, d, e] = roots[0].children;
  expect(a.image).toEqual({ src: `data:image/png;base64,${btoa("fakepng")}`, w: 200, h: 133 });
  expect(b.image).toEqual({ src: `data:image/svg+xml;base64,${btoa(svg)}`, w: 64, h: 32 }); // sized by its viewBox
  expect([c.image, d.image, e.image]).toEqual([undefined, undefined, undefined]);
  expect(lost).toEqual(["2 × images dropped", "images too large to embed dropped"]);
});

test("boundaries, icons and fills are read from XMind", async () => {
  const sheet = [{ id: "s", class: "sheet", title: "S", rootTopic: {
    id: "r", title: "root", boundaries: [{ id: "m", range: "master", title: "all" }],
    markers: [{ markerId: "star-blue" }, { markerId: "flag-red" }, { markerId: "smiley-laugh" }],
    children: { attached: [
      { id: "a", title: "A", style: { properties: { "svg:fill": "#FFEEAC", "fo:font-size": "16pt" } } },
      { id: "b", title: "B", markers: [{ markerId: "symbol-exclam" }] },
      { id: "c", title: "C" },
    ] },
  } }];
  const { roots, lost } = await importXmindReport(zip({ "content.json": JSON.stringify(sheet) }));
  const r = roots[0], [a, b] = r.children;
  expect(r.bounds).toEqual([r.id]);
  expect(r.icon).toBe("⭐");
  expect(a.color).toBe("#FFEEAC");
  expect(b.icon).toBe("❗");
  expect(lost).toEqual(["topic styles other than bold, italic, strike, text colour and fill dropped", "2 × markers with no counterpart dropped", "boundary titles dropped"]);
});

test("a boundary over several siblings becomes one boundary per topic", async () => {
  const sheet = [{ id: "s", class: "sheet", title: "S", rootTopic: { id: "r", title: "root", boundaries: [{ id: "x", range: "(0,1)" }, { id: "y", range: "oops" }],
    children: { attached: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] } } }];
  const { roots, lost } = await importXmindReport(zip({ "content.json": JSON.stringify(sheet) }));
  expect(roots[0].bounds).toEqual(roots[0].children.slice(0, 2).map((k) => k.id));
  expect(lost).toEqual(["boundaries over several topics drawn around each topic", "boundaries dropped"]);
});

test("XMind 7 boundaries are read too", async () => {
  const xml = `<xmap-content><sheet><topic id="r"><title>r</title><boundaries><boundary range="(1,1)"><title>t</title></boundary><boundary range="(0,)"/></boundaries>
    <children><topics type="attached"><topic id="a"><title>a</title></topic><topic id="b"><title>b</title></topic></topics></children></topic></sheet></xmap-content>`;
  const { roots, lost } = await importXmindReport(zip({ "content.xml": xml }));
  expect(roots[0].bounds).toEqual([roots[0].children[1].id, ...roots[0].children.map((k) => k.id)]); // "(0,)" runs to the last child
  expect(lost).toEqual(["boundary titles dropped", "boundaries over several topics drawn around each topic"]);
});
