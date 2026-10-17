export type Rel = { id: string; from: string; to: string };
export type Shape = "round" | "rect" | "line";
export type Node = {
  id: string;
  text: string;
  children: Node[];
  collapsed?: boolean;
  color?: string;
  icon?: string;
  note?: string;
  link?: string;
  shape?: Shape;
  // Document-level settings, only meaningful on the root node.
  layout?: "right" | "map";
  theme?: string;
  rels?: Rel[];
  bounds?: string[];
};
export type Box = {
  id: string; x: number; y: number; w: number; h: number;
  parent?: string; depth: number;
  side: 1 | -1; // which side of the root the node grows towards
  branch: number; // index of the top-level ancestor (-1 for the root)
};

export const mk = (text = ""): Node => ({ id: crypto.randomUUID(), text, children: [] });

const map = (n: Node, id: string, f: (n: Node) => Node): Node =>
  n.id === id ? f(n) : { ...n, children: n.children.map((c) => map(c, id, f)) };

export const parentOf = (root: Node, id: string): Node | undefined =>
  root.children.some((c) => c.id === id)
    ? root
    : root.children.map((c) => parentOf(c, id)).find(Boolean);

export const findNode = (n: Node, id: string): Node | undefined =>
  n.id === id ? n : n.children.map((c) => findNode(c, id)).find(Boolean);

/** Shallow-merge `p` into one node (text, colour, note, theme, …). */
export const patch = (root: Node, id: string, p: Partial<Node>) => map(root, id, (n) => ({ ...n, ...p }));

export const rename = (root: Node, id: string, text: string) => (findNode(root, id)?.text === text ? root : patch(root, id, { text }));

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

/** Deep copy with fresh ids; document-level settings are not copied. */
export const clone = (n: Node): Node => {
  const { rels, bounds, layout, theme, ...rest } = n;
  void rels, bounds, layout, theme;
  return { ...rest, id: crypto.randomUUID(), children: n.children.map(clone) };
};

/** `n` plus every descendant that is currently visible (not hidden under a collapsed node). */
export const visibleIds = (n: Node): string[] => [n.id, ...(n.collapsed ? [] : n.children.flatMap(visibleIds))];

const H = 34, GAP_X = 56, GAP_Y = 12;
const widthOf = (n: Node) =>
  Math.max(56, [...n.text].length * 8.5 + 28 + (n.icon ? 22 : 0) + (n.note ? 20 : 0) + (n.link ? 20 : 0));

type Raw = Omit<Box, "side" | "branch">;

/** Tidy right-growing tree: leaves take consecutive rows, parents centre on their children. */
function half(root: Node): Raw[] {
  const widths: number[] = [];
  const walk = (n: Node, d: number) => {
    widths[d] = Math.max(widths[d] ?? 0, widthOf(n));
    if (!n.collapsed) n.children.forEach((c) => walk(c, d + 1));
  };
  walk(root, 0);
  const colX = widths.reduce<number[]>((a, _, i) => [...a, i ? a[i - 1] + widths[i - 1] + GAP_X : 0], []);

  const out: Raw[] = [];
  let row = 0;
  const place = (n: Node, d: number, parent?: string): number => {
    const kids = n.collapsed ? [] : n.children;
    const slot = out.length;
    out.push(null as unknown as Raw); // reserve so parents precede children
    let cy: number;
    if (!kids.length) cy = row++ * (H + GAP_Y) + H / 2;
    else {
      const ys = kids.map((c) => place(c, d + 1, n.id));
      cy = (ys[0] + ys[ys.length - 1]) / 2;
    }
    out[slot] = { id: n.id, x: colX[d], y: cy - H / 2, w: widthOf(n), h: H, parent, depth: d };
    return cy;
  };
  place(root, 0);
  return out;
}

/** "right": everything grows right. "map": top-level branches split between right and left of the root. */
export function layout(root: Node): Box[] {
  const kids = root.children;
  const cut = root.layout === "map" && !root.collapsed ? Math.ceil(kids.length / 2) : kids.length;
  const right = half({ ...root, children: kids.slice(0, cut) });
  const out: Box[] = right.map((b) => ({ ...b, side: 1, branch: -1 }));

  if (cut < kids.length) {
    const left = half({ ...root, collapsed: false, children: kids.slice(cut) });
    const dy = right[0].y - left[0].y; // line the two roots up
    const rw = right[0].w;
    for (const b of left.slice(1)) out.push({ ...b, x: rw - b.x - b.w, y: b.y + dy, side: -1, branch: -1 });
  }

  const branch: Record<string, number> = {};
  for (const b of out) {
    if (b.depth === 0) continue;
    branch[b.id] = b.depth === 1 ? kids.findIndex((k) => k.id === b.id) : branch[b.parent!];
    b.branch = branch[b.id];
  }
  return out;
}

export const toMarkdown = (n: Node, depth = 0): string =>
  `${"  ".repeat(depth)}- ${n.text || "(empty)"}\n${n.children.map((c) => toMarkdown(c, depth + 1)).join("")}`;

/** Arrow-key navigation over the visible layout. */
export function neighbour(root: Node, boxes: Box[], id: string, dir: "left" | "right" | "up" | "down"): string {
  const me = boxes.find((b) => b.id === id)!;
  if (dir === "left" || dir === "right") {
    const toward = dir === "right" ? 1 : -1;
    const n = findNode(root, id)!;
    const kids = n.collapsed ? [] : n.children;
    const sideOf = (k: Node) => boxes.find((b) => b.id === k.id)!.side;
    if (id === root.id) return kids.find((k) => sideOf(k) === toward)?.id ?? id;
    return me.side === toward ? (kids[0]?.id ?? id) : (me.parent ?? id);
  }
  const same = boxes.filter((b) => b.depth === me.depth && b.side === me.side).sort((a, b) => a.y - b.y);
  const i = same.findIndex((b) => b.id === id);
  return (same[i + (dir === "down" ? 1 : -1)] ?? me).id;
}

/** Ids of nodes whose text or note contains `q` (case-insensitive), in document order. */
export function search(root: Node, q: string): string[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.text.toLowerCase().includes(s) || n.note?.toLowerCase().includes(s)) out.push(n.id);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

/** Visible topics in document order with their depth (collapsed branches are skipped). */
export const flat = (n: Node, d = 0): { n: Node; d: number }[] => [
  { n, d },
  ...(n.collapsed ? [] : n.children.flatMap((c) => flat(c, d + 1))),
];

/** Nest `id` under its previous sibling. No-op for a first child or the root. */
export function indent(root: Node, id: string): Node {
  const p = parentOf(root, id);
  const i = p ? p.children.findIndex((c) => c.id === id) : -1;
  return i > 0 ? moveTo(root, id, p!.children[i - 1].id) : root;
}

/** Move `id` out to sit right after its parent. No-op for top-level topics and the root. */
export function outdent(root: Node, id: string): Node {
  const p = parentOf(root, id);
  return p && p.id !== root.id ? addSibling(remove(root, id), p.id, findNode(root, id)!) : root;
}
