import { expect, test } from "vitest";
import { mk, Node } from "./model";
import { fromMindmanager, fromMindmanagerBytes, toMindmanager } from "./mindmanager";
import { zip } from "./xmind";

const DOC = `<?xml version="1.0" encoding="UTF-8"?>
<ap:Map xmlns:ap="http://schemas.mindjet.com/MindManager/Application/2003" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ap:OneTopic>
    <ap:Topic OId="root1">
      <ap:Text PlainText="Central"><ap:Font Color="ff1e3a5f"/></ap:Text>
      <ap:Color FillColor="ff0d9488"/>
      <ap:Hyperlink Url="https://example.com"/>
      <ap:NotesGroup><ap:NotesXhtmlData PreviewPlainText="a note
on two lines"><html xmlns="http://www.w3.org/1999/xhtml"><body><p>a note</p><p>on two lines</p></body></html></ap:NotesXhtmlData></ap:NotesGroup>
      <ap:Task TaskPriority="urn:mindjet:Prio1" TaskPercentage="40"/>
      <ap:TopicViewGroup ViewIndex="0"><ap:Collapsed Collapsed="true"/></ap:TopicViewGroup>
      <ap:SubTopics>
        <ap:Topic OId="left1"><ap:Text PlainText="Left"/><ap:Offset CX="-40" CY="10"/><ap:FloatingTopics><ap:Topic><ap:Text PlainText="Callout"/></ap:Topic></ap:FloatingTopics><ap:SubTopics><ap:Topic OId="deep"><ap:Text PlainText="Deep"/></ap:Topic></ap:SubTopics></ap:Topic>
        <ap:Topic OId="right1"><ap:Text PlainText="Right"/><ap:Offset CX="40" CY="-10"/></ap:Topic>
      </ap:SubTopics>
      <ap:SubTopicsShape SubTopicsGrowthDirection="urn:mindjet:LeftAndRight"/>
      <ap:FloatingTopics><ap:Topic OId="float1"><ap:Text PlainText="Floating"/><ap:Offset CX="-100" CY="60"/></ap:Topic></ap:FloatingTopics>
    </ap:Topic>
  </ap:OneTopic>
  <ap:Relationships>
    <ap:Relationship>
      <ap:ConnectionGroup Index="0"><ap:Connection><ap:ObjectReference OIdRef="left1"/></ap:Connection></ap:ConnectionGroup>
      <ap:ConnectionGroup Index="1"><ap:Connection><ap:ObjectReference OIdRef="right1"/></ap:Connection></ap:ConnectionGroup>
    </ap:Relationship>
  </ap:Relationships>
</ap:Map>`;

test("reads a MindManager document", () => {
  const [root] = fromMindmanager(DOC);
  expect(root.text).toBe("Central");
  expect(root.note).toBe("a note\non two lines");
  expect(root.link).toBe("https://example.com");
  expect(root.color).toBe("#0d9488");
  expect(root.textColor).toBe("#1e3a5f");
  expect(root.priority).toBe(1);
  expect(root.progress).toBe(40);
  expect(root.collapsed).toBe(true);
  expect(root.layout).toBe("map"); // MindManager grows both sides by default
  expect(root.children.map((c) => c.text)).toEqual(["Right", "Left", "Floating"]); // the map grows right first; floating topics follow
  expect(root.children[1].children.map((c) => c.text)).toEqual(["Deep", "Callout"]); // a callout opens as a plain child
  expect(root.children[2].float).toEqual({ x: -378, y: 227 }); // millimetres -> pixels
  expect(root.rels).toHaveLength(1);
  expect(root.rels![0].from).toBe(root.children[1].id); // remapped to our topic ids
  expect(root.rels![0].to).toBe(root.children[0].id);
});

test("reads the simplified schema some tools write", () => {
  const [root] = fromMindmanager(`<?xml version="1.0"?>
<Map><Topic ID="t1" Text="Root"><Notes>plain note</Notes><Hyperlink URL="https://x.org"/><Topic ID="t2" Text="Child"><Icon IconType="urn:mindjet:Prio2"/></Topic></Topic></Map>`);
  expect(root.text).toBe("Root");
  expect(root.note).toBe("plain note");
  expect(root.link).toBe("https://x.org");
  expect(root.children[0].text).toBe("Child");
  expect(root.children[0].priority).toBe(2);
});

test("refuses what is not a MindManager map", async () => {
  expect(() => fromMindmanager(`<?xml version="1.0"?><!DOCTYPE Map><Map/>`)).toThrow(); // no DOCTYPE, ever
  expect(() => fromMindmanager(`<?xml version="1.0"?><Map><OneTopic/></Map>`)).toThrow(/no topic/);
  expect(() => fromMindmanager(`not a mind map`)).toThrow();
  await expect(fromMindmanagerBytes(zip({ "empty.txt": "x" }))).rejects.toThrow(/Document.xml/);
});

test("writes a zip MindManager re-opens", async () => {
  const root: Node = {
    ...mk("Central\ntopic"),
    note: "note\nlines",
    link: "https://example.org",
    priority: 3,
    progress: 60,
    color: "#0d9488",
    textColor: "#1e3a5f",
    children: [mk("Child"), { ...mk("Folded"), collapsed: true, children: [mk("Grand")] }],
  };
  root.rels = [{ id: crypto.randomUUID(), from: root.children[1].children[0].id, to: root.children[0].id }];
  const bytes = toMindmanager([root, mk("Second sheet")]);
  expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // a zip
  const back = await fromMindmanagerBytes(bytes);
  expect(back.map((r) => r.text)).toEqual(["Central\ntopic", "Second sheet"]); // one map per sheet, newlines kept
  const [r] = back;
  expect(r.note).toBe("note\nlines");
  expect(r.link).toBe("https://example.org");
  expect(r.priority).toBe(3);
  expect(r.progress).toBe(60);
  expect(r.color).toBe("#0d9488");
  expect(r.textColor).toBe("#1e3a5f");
  expect(r.children[1].collapsed).toBe(true);
  expect(r.rels).toHaveLength(1);
  expect(r.rels![0].from).toBe(r.children[1].children[0].id);
  expect(r.rels![0].to).toBe(r.children[0].id);
});

test("the growth direction picks the layout, and flat XML opens", async () => {
  const doc = (dir: string) => `<?xml version="1.0"?>
<ap:Map xmlns:ap="http://schemas.mindjet.com/MindManager/Application/2003"><ap:OneTopic><ap:Topic><ap:Text PlainText="R"/><ap:SubTopicsShape SubTopicsGrowthDirection="urn:mindjet:${dir}"/><ap:SubTopics><ap:Topic><ap:Text PlainText="A"/></ap:Topic></ap:SubTopics></ap:Topic></ap:OneTopic></ap:Map>`;
  expect(fromMindmanager(doc("Left"))[0].layout).toBe("left");
  expect(fromMindmanager(doc("Right"))[0].layout).toBeUndefined(); // the app's default chart grows right
  const flat = await fromMindmanagerBytes(new TextEncoder().encode(doc("Right"))); // not a zip: flat XML
  expect(flat[0].children[0].text).toBe("A");
});

test("MindManager colours: alpha first, #rrggbb kept, junk dropped", () => {
  const one = (v: string) => `<OneTopic><Topic><Text PlainText="t"/><Color FillColor="${v}"/></Topic></OneTopic>`;
  const roots = fromMindmanager(`<Map>${one("00ffffff")}${one("ff0d9488")}${one("#12ab34")}${one("red")}</Map>`);
  expect(roots.map((r) => r.color)).toEqual([undefined, "#0d9488", "#12ab34", undefined]);
});
