import { expect, test } from "vitest";
import { fromFreemind, fromFreemindBytes, toFreemind } from "./freemind";
import { Node, mk } from "./model";

const sample = `<map version="1.0.1">
  <node ID="ID_root" TEXT="Projet" FOLDED="true">
    <node ID="ID_a" TEXT="Étude" POSITION="right" COLOR="#ff0000">
      <richcontent TYPE="NODE"><html><head/><body><p>Ligne un</p><p>Ligne &lt;deux&gt;</p></body></html></richcontent>
      <icon BUILTIN="full-3"/>
      <arrowlink DESTINATION="ID_b"/>
      <node ID="ID_a1" TEXT="Bibliographie">
        <hook NAME="map/Note"><text>Voir la revue de 2025</text></hook>
      </node>
    </node>
    <node ID="ID_b" TEXT="Création" POSITION="left" LINK="https://example.com/">
      <icon BUILTIN="75%"/>
      <node ID="ID_b1" TEXT="Maquette" BACKGROUND_COLOR="00ccff">
        <font BOLD="true" ITALIC="true"/>
      </node>
    </node>
  </node>
</map>`;

test("a FreeMind sample opens: rich text keeps its line order, links and icons come across", () => {
  const roots = fromFreemind(sample);
  expect(roots).toHaveLength(1);
  const root = roots[0];
  expect(root.text).toBe("Projet");
  expect(root.collapsed).toBe(true); // FOLDED, with children under it
  expect(root.layout).toBe("map"); // one right-side topic, one left-side
  expect(root.children.map((c) => c.text)).toEqual(["Ligne un\nLigne <deux>", "Création"]); // right first
  const study = root.children[0];
  expect(study.textColor).toBe("#ff0000");
  expect(study.priority).toBe(3);
  expect(study.topicLink).toBe(root.children[1].id); // arrowlink remapped to the new ids
  expect(study.children[0].note).toBe("Voir la revue de 2025"); // FreeMind 0.9's map/Note hook
  const creation = root.children[1];
  expect(creation.link).toBe("https://example.com/");
  expect(creation.progress).toBe(75);
  expect(creation.children[0].color).toBe("#00ccff"); // a hex without the #
  expect(creation.children[0].bold).toBe(true);
  expect(creation.children[0].italic).toBe(true);
});

test("left-side topics everywhere open as a one-sided chart", () => {
  const roots = fromFreemind(`<map version="1.0.1"><node TEXT="Racine"><node TEXT="A" POSITION="left"/><node TEXT="B" POSITION="left"/></node></map>`);
  expect(roots[0].layout).toBe("left");
  expect(roots[0].children.map((c) => c.text)).toEqual(["A", "B"]);
});

// Reading mints fresh ids (and remaps topic links onto them), so compare the maps without them.
const noIds = (r: Node[]) => JSON.stringify(r, (k, v) => (k === "id" || k === "topicLink" ? undefined : v));

test("a gzipped .mm opens like a plain one", async () => {
  const plain = new TextEncoder().encode(sample);
  const gz = new Uint8Array(await new Response(new Blob([plain as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  expect(noIds(await fromFreemindBytes(gz))).toBe(noIds(await fromFreemindBytes(plain)));
});

test("strict reading: a DOCTYPE, non-XML and a map without a topic are rejected", () => {
  expect(() => fromFreemind("<!DOCTYPE map><map/>")).toThrow();
  expect(() => fromFreemind("ceci n'est pas du XML")).toThrow();
  expect(() => fromFreemind("<map version='1.0.1'/>")).toThrow();
});

test("colours, multi-line text and progress survive the round trip", () => {
  const root = {
    ...mk("Sauvegarde"),
    layout: "left" as const,
    children: [
      { ...mk("Première\nDeuxième"), color: "#00ccff", textColor: "#ff0000", bold: true, italic: true, priority: 2, progress: 30, children: [mk("Enfant & \"suite\"")] },
      mk("Simple"),
    ],
  };
  const back = fromFreemind(toFreemind([root]))[0];
  expect(back.text).toBe("Sauvegarde");
  expect(back.layout).toBe("left");
  expect(back.children.map((c) => c.text)).toEqual(["Première\nDeuxième", "Simple"]);
  const first = back.children[0];
  expect(first.color).toBe("#00ccff");
  expect(first.textColor).toBe("#ff0000");
  expect(first.bold).toBe(true);
  expect(first.italic).toBe(true);
  expect(first.priority).toBe(2);
  expect(first.progress).toBe(25); // written as the nearest FreeMind progress icon
  expect(first.children[0].text).toBe('Enfant & "suite"'); // XML escaping holds
});

test("notes open from both FreeMind 0.9's hook and newer richcontent", () => {
  const roots = fromFreemind(
    `<map version="1.0.1"><node TEXT="R">` +
      `<node TEXT="A"><hook NAME="map/Note"><text>ancienne note</text></hook></node>` +
      `<node TEXT="B"><richcontent TYPE="NOTE"><html><head/><body><p>note riche</p></body></html></richcontent></node>` +
      `</node></map>`,
  );
  expect(roots[0].children[0].note).toBe("ancienne note");
  expect(roots[0].children[1].note).toBe("note riche");
});
