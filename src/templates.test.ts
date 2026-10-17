import { expect, test } from "vitest";
import { Node, layout } from "./model";
import { TEMPLATES } from "./templates";

const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)];

test("templates have distinct names and use a variety of structures", () => {
  expect(new Set(TEMPLATES.map((x) => x.name)).size).toBe(TEMPLATES.length);
  expect(new Set(TEMPLATES.map((x) => x.build().layout)).size).toBeGreaterThanOrEqual(6);
});

test("every template is a sound map: fresh unique ids, no empty root, laid out without overlap", () => {
  const seen = new Set<string>();
  for (const tpl of TEMPLATES) {
    const root = tpl.build();
    const nodes = all(root);
    expect(root.text, tpl.name).not.toBe("");
    expect(root.children.length, tpl.name).toBeGreaterThanOrEqual(2);
    expect(new Set(nodes.map((n) => n.id)).size, tpl.name).toBe(nodes.length); // unique inside the template
    for (const n of nodes) {
      expect(seen.has(n.id), `${tpl.name}: id reused across templates`).toBe(false);
      seen.add(n.id);
    }
    expect(tpl.build().id, tpl.name).not.toBe(root.id); // every build is fresh

    const boxes = layout(root);
    expect(boxes, tpl.name).toHaveLength(nodes.length); // nothing is collapsed, so every topic is placed
    expect(boxes.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y)), tpl.name).toBe(true);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i], q = boxes[j];
        expect(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${tpl.name}: ${p.id} overlaps ${q.id}`).toBe(true);
      }
  }
});

test("task-style topics start at 0% progress", () => {
  const plan = TEMPLATES.find((x) => x.name === "Project plan")!.build();
  const tasks = all(plan).filter((n) => n.text.startsWith("Task"));
  expect(tasks).toHaveLength(2);
  expect(tasks.every((n) => n.progress === 0)).toBe(true);
});
