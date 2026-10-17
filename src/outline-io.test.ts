import { expect, test } from "vitest";
import { docBytes, parseDoc } from "./files";
import { Node, mk, toMarkdown } from "./model";
import { fromMarkdown, fromOpml, toOpml } from "./outline-io";

const tree = (n: Node): unknown => (n.children.length ? [n.text, n.children.map(tree)] : n.text);

test("markdown: headings and nested lists become the hierarchy", () => {
  const md = `# Plan\n\n## Phase 1\n- Research\n  - Users\n  - Market\n- Build\n\n## Phase 2\n1. Launch\n2. Review\n`;
  const root = fromMarkdown(md);
  expect(tree(root)).toEqual(["Plan", [["Phase 1", [["Research", ["Users", "Market"]], "Build"]], ["Phase 2", ["Launch", "Review"]]]]);
});

test("markdown: indentation in tabs or four spaces, plain lines, and jumps in heading level", () => {
  expect(tree(fromMarkdown("- a\n\t- b\n\t\t- c\n- d"))).toEqual(["Imported map", [["a", [["b", ["c"]]]], "d"]]);
  expect(tree(fromMarkdown("- a\n    - b\n        - c"))).toEqual(["a", [["b", ["c"]]]]); // one top-level item is the root
  expect(tree(fromMarkdown("# T\nsome text\n### Deep\n- x"))).toEqual(["T", ["some text", ["Deep", ["x"]]]]);
  expect(fromMarkdown("- a\n- b", "My notes").text).toBe("My notes");
});

test("markdown: task boxes, links, emphasis, code fences, rules and front matter", () => {
  const md = `---\ntitle: ignored\n---\n# Root\n- [x] done **bold** and *it*\n- [ ] todo\n- [site](https://example.com/a) and [mail](mailto:a@b.c)\n- \`code\` snake_case_name\n\`\`\`\n- not a topic\n\`\`\`\n---\n- last\n`;
  const [done, todo, link, code, last] = fromMarkdown(md).children;
  expect(done).toMatchObject({ text: "done bold and it", progress: 100 });
  expect(todo).toMatchObject({ text: "todo", progress: 0 });
  expect(link).toMatchObject({ text: "site and mail", link: "https://example.com/a" }); // the first link is kept
  expect(code.text).toBe("code snake_case_name");
  expect(last.text).toBe("last");
  expect(fromMarkdown(md).children).toHaveLength(5); // front matter, fence contents and the rule are not topics
  expect(() => fromMarkdown("\n\n---\n")).toThrow("no outline found");
});

test("our own Markdown export reads back as the same tree", () => {
  const r = { ...mk("Root"), children: [{ ...mk("a"), children: [mk("a1"), mk("a2")] }, mk("b")] };
  expect(tree(fromMarkdown(toMarkdown(r)))).toEqual(tree(r));
});

const OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Reading list</title></head>
  <body>
    <outline text="Books &amp; papers" _note="line one&#10;line two">
      <outline text="Done" _status="checked" type="link" url="https://example.com/x?a=1&amp;b=2"/>
      <outline text="Todo"/>
    </outline>
    <outline text="Second"/>
  </body>
</opml>`;

test("opml: text, notes, links, checked status; several top-level outlines share a root", () => {
  const root = fromOpml(OPML);
  expect(root.text).toBe("Reading list"); // from the head title
  const [books, second] = root.children;
  expect(books).toMatchObject({ text: "Books & papers", note: "line one\nline two" });
  expect(books.children[0]).toMatchObject({ text: "Done", progress: 100, link: "https://example.com/x?a=1&b=2" });
  expect(books.children[1].progress).toBeUndefined();
  expect(second.text).toBe("Second");
  expect(fromOpml('<opml><body><outline text="Only"><outline text="child"/></outline></body></opml>').text).toBe("Only");
  expect(() => fromOpml("<opml><head/></opml>")).toThrow("no body");
  expect(() => fromOpml("<opml><body/></opml>")).toThrow("no outline found");
  expect(() => fromOpml('<!DOCTYPE opml [<!ENTITY e "x">]><opml><body><outline text="&e;"/></body></opml>')).toThrow("DOCTYPE");
});

test("opml export escapes everything and reads back", () => {
  const root = { ...mk('Root "q" <&>'), note: "a\nb", link: "https://x.test/?a=1&b=2", progress: 100, children: [{ ...mk("kid \u0001ok"), children: [] }] };
  const xml = toOpml([root]);
  expect(xml).toContain('text="Root &quot;q&quot; &lt;&amp;&gt;"');
  expect(xml).not.toContain("\u0001");
  const back = fromOpml(xml);
  expect(back).toMatchObject({ text: 'Root "q" <&>', note: "a\nb", link: "https://x.test/?a=1&b=2", progress: 100 });
  expect(back.children[0].text).toBe("kid ok");
  // two sheets are two top-level outlines
  const two = fromOpml(toOpml([mk("One"), mk("Two")]));
  expect(two.children.map((c) => c.text)).toEqual(["One", "Two"]);
});

test("documents open and save by extension: .opml and .md", async () => {
  const roots = [{ ...mk("Root"), children: [mk("a")] }];
  const opml = docBytes("/x/map.opml", roots, 0);
  expect(new TextDecoder().decode(opml)).toContain("<opml");
  expect((await parseDoc("map.opml", opml)).roots[0].children[0].text).toBe("a");
  const md = docBytes("/x/map.md", roots, 0);
  expect(new TextDecoder().decode(md)).toBe("- Root\n  - a\n");
  const back = await parseDoc("My notes.md", md);
  expect(tree(back.roots[0])).toEqual(["Root", ["a"]]);
  expect((await parseDoc("flat.md", new TextEncoder().encode("- a\n- b"))).roots[0].text).toBe("flat"); // named after the file
});
