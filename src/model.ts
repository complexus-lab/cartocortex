export type Node = { id: string; text: string; children: Node[]; collapsed?: boolean };
export type Box = { id: string; x: number; y: number; w: number; h: number; parent?: string; depth: number };

export const mk = (text = ""): Node => ({ id: crypto.randomUUID(), text, children: [] });

const map = (n: Node, id: string, f: (n: Node) => Node): Node =>
  n.id === id ? f(n) : { ...n, children: n.children.map((c) => map(c, id, f)) };

export const parentOf = (root: Node, id: string): Node | undefined =>
  root.children.some((c) => c.id === id)
    ? root
    : root.children.map((c) => parentOf(c, id)).find(Boolean);

export const findNode = (n: Node, id: string): Node | undefined =>
  n.id === id ? n : n.children.map((c) => findNode(c, id)).find(Boolean);

export const rename = (root: Node, id: string, text: string) => map(root, id, (n) => ({ ...n, text }));

export const toggle = (root: Node, id: string) =>
  map(root, id, (n) => (n.children.length ? { ...n, collapsed: !n.collapsed } : n));

export const addChild = (root: Node, id: string, child: Node) =>
  map(root, id, (n) => ({ ...n, collapsed: false, children: [...n.children, child] }));

export function addSibling(root: Node, id: string, child: Node): Node {
  const p = parentOf(root, id);
  if (!p) return addChild(root, id, child); // root has no siblings
  return map(root, p.id, (n) => {
    const i = n.children.findIndex((c) => c.id === id);
    return { ...n, children: [...n.children.slice(0, i + 1), child, ...n.children.slice(i + 1)] };
  });
}

export const remove = (root: Node, id: string): Node =>
  root.id === id ? root : { ...root, children: root.children.filter((c) => c.id !== id).map((c) => remove(c, id)) };

/** Reparent `id` under `target` (appended last). No-op if target is inside id's subtree. */
export function moveTo(root: Node, id: string, target: string): Node {
  const moving = findNode(root, id);
  if (!moving || id === root.id || findNode(moving, target)) return root;
  return addChild(remove(root, id), target, moving);
}

const H = 34, GAP_X = 56, GAP_Y = 12;
const widthOf = (t: string) => Math.max(56, [...t].length * 8.5 + 28);

/** Tidy right-growing tree: leaves take consecutive rows, parents centre on their children. */
export function layout(root: Node): Box[] {
  const widths: number[] = [];
  const walk = (n: Node, d: number) => {
    widths[d] = Math.max(widths[d] ?? 0, widthOf(n.text));
    if (!n.collapsed) n.children.forEach((c) => walk(c, d + 1));
  };
  walk(root, 0);
  const colX = widths.reduce<number[]>((a, _, i) => [...a, i ? a[i - 1] + widths[i - 1] + GAP_X : 0], []);

  const out: Box[] = [];
  let row = 0;
  const place = (n: Node, d: number, parent?: string): number => {
    const kids = n.collapsed ? [] : n.children;
    const slot = out.length;
    out.push(null as unknown as Box); // reserve so parents precede children
    let cy: number;
    if (!kids.length) cy = row++ * (H + GAP_Y) + H / 2;
    else {
      const ys = kids.map((c) => place(c, d + 1, n.id));
      cy = (ys[0] + ys[ys.length - 1]) / 2;
    }
    out[slot] = { id: n.id, x: colX[d], y: cy - H / 2, w: widthOf(n.text), h: H, parent, depth: d };
    return cy;
  };
  place(root, 0);
  return out;
}

export const toMarkdown = (n: Node, depth = 0): string =>
  `${"  ".repeat(depth)}- ${n.text || "(empty)"}\n${n.children.map((c) => toMarkdown(c, depth + 1)).join("")}`;

/** Arrow-key navigation over the visible layout. */
export function neighbour(root: Node, boxes: Box[], id: string, dir: "left" | "right" | "up" | "down"): string {
  const me = boxes.find((b) => b.id === id)!;
  if (dir === "left") return me.parent ?? id;
  if (dir === "right") {
    const n = findNode(root, id)!;
    return !n.collapsed && n.children.length ? n.children[0].id : id;
  }
  const same = boxes.filter((b) => b.depth === me.depth).sort((a, b) => a.y - b.y);
  const i = same.findIndex((b) => b.id === id);
  return (same[i + (dir === "down" ? 1 : -1)] ?? me).id;
}
