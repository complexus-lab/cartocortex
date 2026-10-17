import { expect, test } from "vitest";
import { Node, findNode, mk, reveal } from "./model";
import { exportXmind, importXmindSheets } from "./xmind";
import { sheetsFromXml, topicHref } from "./xmindxml";

const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)];
const find = (roots: Node[], text: string) => roots.flatMap(all).find((n) => n.text === text)!;

test("reveal expands collapsed ancestors only", () => {
  const leaf = mk("leaf");
  const mid = { ...mk("mid"), collapsed: true, children: [leaf] };
  const top = { ...mk("top"), collapsed: true, children: [mid] };
  const root = { ...mk("root"), children: [top, { ...mk("other"), collapsed: true, children: [mk("x")] }] };
  const out = reveal(root, leaf.id);
  expect(findNode(out, top.id)!.collapsed).toBe(false);
  expect(findNode(out, mid.id)!.collapsed).toBe(false);
  expect(out.children[1].collapsed).toBe(true); // unrelated branches stay folded
  expect(reveal(out, leaf.id)).toBe(out); // nothing left to expand: same object, so no spurious change
  expect(reveal(root, root.id)).toBe(root);
});

test("topicHref only reads xmind:# links", () => {
  expect([topicHref("xmind:#abc"), topicHref("https://x.test"), topicHref(undefined), topicHref("xmind:#")]).toEqual(["abc", undefined, undefined, ""]);
});

test("links between topics survive an .xmind round trip, across sheets", async () => {
  const target = { ...mk("Target"), children: [mk("deep")] };
  const sheet2 = { ...mk("Second sheet"), children: [target] };
  const sheet1 = { ...mk("First sheet"), children: [{ ...mk("points at target"), topicLink: target.id }, { ...mk("points at nothing"), topicLink: "gone" }] };
  const roots = await importXmindSheets(exportXmind([sheet1, sheet2]));
  const a = find(roots, "points at target"), b = find(roots, "points at nothing");
  const newTarget = find(roots, "Target");
  expect(newTarget.id).not.toBe(target.id); // import assigns fresh ids…
  expect(a.topicLink).toBe(newTarget.id); // …and the link follows the topic, into the other sheet
  expect(b.topicLink).toBeUndefined(); // a link to a topic that is not in the file is dropped
  expect(a.link).toBeUndefined(); // it is a topic link, not a web link
});

test("an outside link wins over a topic link in XMind, which has one href per topic", async () => {
  const target = mk("T");
  const both = { ...mk("both"), link: "https://example.com/", topicLink: target.id };
  const [root] = await importXmindSheets(exportXmind({ ...mk("r"), children: [both, target] }));
  expect(root.children[0]).toMatchObject({ link: "https://example.com/" });
  expect(root.children[0].topicLink).toBeUndefined();
});

test("topic links in an XMind 8 file", () => {
  const xml = `<xmap-content xmlns:xlink="http://www.w3.org/1999/xlink"><sheet><topic id="r"><title>Root</title><children><topics type="attached">
    <topic id="a" xlink:href="xmind:#b"><title>A</title></topic>
    <topic id="b"><title>B</title></topic>
    <topic id="c" xlink:href="xmind:#missing"><title>C</title></topic>
    <topic id="d" xlink:href="https://example.com"><title>D</title></topic>
  </topics></children></topic></sheet></xmap-content>`;
  const [root] = sheetsFromXml(xml);
  const [a, b, c, d] = root.children;
  expect(a.topicLink).toBe(b.id);
  expect(c.topicLink).toBeUndefined();
  expect(d).toMatchObject({ link: "https://example.com" });
});
