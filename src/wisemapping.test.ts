import { expect, test } from "vitest";
import { mk, Node } from "./model";
import { fromWisemapping, toWisemapping } from "./wisemapping";

const sample = `<map version="tango" name="essai">
  <topic central="true" id="1" text="Racine"><note><![CDATA[une note
sur deux lignes]]></note><topic id="2" position="200,-50" order="0" text="Droite"><link url="https://example.com/"/><eicon id="\u2b50"/></topic><topic id="3" position="-200,50" order="1" text="Gauche" shrink="true"><topic id="4" position="-290,25" order="0" text="Enfant &lt;et&gt;"/></topic><topic id="5" position="200,150" order="2" fontStyle=";;#cc0000;bold;italic;" bgColor="#00ccff" shape="line"><text><![CDATA[premi\u00e8re
seconde]]></text></topic></topic>
  <topic id="6" position="400,300" order="0" text="Libre"><note text="encoded%20note"/></topic>
  <relationship srcTopicId="5" destTopicId="6" lineType="3" endArrow="true" startArrow="false"/>
</map>`;

test("a WiseMapping sample opens: text blocks, notes, styles and relationships come across", () => {
  const roots = fromWisemapping(sample);
  expect(roots).toHaveLength(1);
  const root = roots[0];
  expect(root.text).toBe("Racine");
  expect(root.note).toBe("une note\nsur deux lignes"); // the note is a CDATA block
  expect(root.layout).toBe("map"); // one left-side topic among three
  expect(root.children.map((c) => c.text)).toEqual(["Droite", "premi\u00e8re\nseconde", "Gauche", "Libre"]); // right side first
  const right = root.children[0];
  expect(right.link).toBe("https://example.com/");
  expect(right.icon).toBe("\u2b50"); // an emoji marker
  const styled = root.children[1];
  expect(styled.textColor).toBe("#cc0000"); // fontStyle is "family;size;colour;weight;style;"
  expect(styled.bold).toBe(true);
  expect(styled.italic).toBe(true);
  expect(styled.color).toBe("#00ccff"); // bgColor
  expect(styled.shape).toBe("line");
  const left = root.children[2];
  expect(left.collapsed).toBe(true); // shrink, with a child under it
  expect(left.children[0].text).toBe("Enfant <et>"); // entities are decoded
  const free = root.children[3];
  expect(free.float).toEqual({ x: 400, y: 300 }); // a topic at map level floats on the canvas
  expect(free.note).toBe("encoded note"); // the old percent-encoded note attribute
  expect(root.rels).toHaveLength(1);
  expect(root.rels![0].from).toBe(styled.id);
  expect(root.rels![0].to).toBe(free.id);
});

test("children keep their order attribute, and a left-leaning map opens as Logic (left)", () => {
  const pela = fromWisemapping(`<map version="pela"><topic central="true" id="1"><topic id="2" order="2" position="-200,60" text="C"/><topic id="3" order="1" position="-200,-60" text="B"/><topic id="4" order="0" position="-200,0" text="A"/></topic></map>`);
  expect(pela[0].layout).toBe("left");
  expect(pela[0].children.map((c) => c.text)).toEqual(["A", "B", "C"]);
  const none = fromWisemapping(`<map version="pela"><topic id="1" text="Premier"/><topic id="2" text="Detache" position="300,100"/></map>`);
  expect(none[0].text).toBe("Premier"); // no central attribute: the first topic opens as the map's centre
  expect(none[0].children[0].text).toBe("Detache");
  expect(none[0].children[0].float).toEqual({ x: 300, y: 100 });
});

test("strict reading: a DOCTYPE, another format and a map without a topic are rejected", () => {
  expect(() => fromWisemapping("<!DOCTYPE map><map/>")).toThrow();
  expect(() => fromWisemapping("<html><body>pas une carte</body></html>")).toThrow(/not a WiseMapping map/);
  expect(() => fromWisemapping('<map version="tango"/>')).toThrow(/no topic/);
  expect(() => fromWisemapping("ceci n'est pas du XML")).toThrow();
});

test("multi-line text, styles, folding and relationships survive the round trip", () => {
  const root: Node = {
    ...mk("Carte"),
    children: [
      {
        ...mk("a]]>b\nfin"), // "]]>" cannot sit inside a CDATA block, so it is split the way WiseMapping writes it
        color: "#00ccff",
        textColor: "#ff0000",
        bold: true,
        italic: true,
        icon: "\u2b50",
        note: "une\nnote",
        link: "https://example.com/",
        shape: "rect",
        children: [mk('Enfant "&"')],
      },
      { ...mk("Pli\u00e9"), collapsed: true, children: [mk("Dedans")] },
    ],
  };
  root.rels = [{ id: root.children[0].children[0].id, from: root.children[0].id, to: root.children[1].children[0].id }];
  const back = fromWisemapping(toWisemapping([root, mk("Second")]))[0];
  expect(back.children[0].text).toBe("a]]>b\nfin");
  expect(back.children[0].children[0].text).toBe('Enfant "&"'); // XML escaping holds
  expect(back.children[0].color).toBe("#00ccff");
  expect(back.children[0].textColor).toBe("#ff0000");
  expect(back.children[0].bold).toBe(true);
  expect(back.children[0].italic).toBe(true);
  expect(back.children[0].icon).toBe("\u2b50");
  expect(back.children[0].note).toBe("une\nnote");
  expect(back.children[0].link).toBe("https://example.com/");
  expect(back.children[0].shape).toBe("rect");
  expect(back.children[1].collapsed).toBe(true);
  expect(back.rels).toHaveLength(1);
  expect(back.rels![0].from).toBe(back.children[0].id);
  expect(back.rels![0].to).toBe(back.children[1].children[0].id);
  const second = back.children[2];
  expect(second.text).toBe("Second");
  expect(second.float).toEqual({ x: 200, y: 250 }); // the sheet after the first opens as a free branch
});

test("writing works out positions: a two-sided map splits, a left chart stays left", () => {
  const out = toWisemapping([{ ...mk("R"), layout: "map" as const, children: [mk("A"), mk("B"), mk("C")] }]);
  expect(out).toContain('position="200,-25"'); // A and B grow right
  expect(out).toContain('position="200,25"');
  expect(out).toContain('position="-200,0"'); // C grows left
  const back = fromWisemapping(out)[0];
  expect(back.layout).toBe("map");
  expect(back.children.map((c) => c.text)).toEqual(["A", "B", "C"]); // the right side comes first

  const left = toWisemapping([{ ...mk("R"), layout: "left" as const, children: [mk("A"), mk("B")] }]);
  expect(left).toContain('position="-200,-25"');
  expect(left).toContain('position="-200,25"');
  expect(fromWisemapping(left)[0].layout).toBe("left");

  const deep = toWisemapping([{ ...mk("R"), children: [{ ...mk("A"), children: [mk("A1"), mk("A2")] }] }]);
  expect(deep).toContain('position="200,0"'); // a first-level topic sits 200 px from the centre
  expect(deep).toContain('position="290,-25"'); // a deeper one 90 px from its parent
  expect(deep).toContain('position="290,25"');
});
