export type Rel = { id: string; from: string; to: string };
export type Summary = { id: string; from: string; to: string; text: string };
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
  priority?: number; // task priority, 1 (most urgent) to 9
  progress?: number; // task progress in percent
  shape?: Shape;
  float?: { x: number; y: number }; // top-level topics only: free-standing at this canvas position, no branch to the root
  // Document-level settings, only meaningful on the root node.
  layout?: "right" | "map";
  theme?: string;
  title?: string; // sheet name (tab label); falls back to the central topic text
  rels?: Rel[];
  bounds?: string[];
  summaries?: Summary[];
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
  const { float, ...attached } = moving; // a topic dropped onto another one stops floating
  void float;
  return addChild(remove(root, id), target, attached);
}

/** Deep copy with fresh ids; document-level settings are not copied. */
export const clone = (n: Node): Node => {
  const { rels, bounds, summaries, layout, theme, title, float, ...rest } = n;
  void rels, bounds, summaries, layout, theme, title, float;
  return { ...rest, id: crypto.randomUUID(), children: n.children.map(clone) };
};

/** `n` plus every descendant that is currently visible (not hidden under a collapsed node). */
export const visibleIds = (n: Node): string[] => [n.id, ...(n.collapsed ? [] : n.children.flatMap(visibleIds))];

const H = 34, GAP_X = 56, GAP_Y = 12;
export const widthOf = (n: Node) =>
  Math.max(56, [...n.text].length * 8.5 + 28 + (n.icon ? 22 : 0) + (n.priority ? 24 : 0) + (n.progress != null ? 24 : 0) + (n.note ? 20 : 0) + (n.link ? 20 : 0));

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
  const kids = root.children.filter((c) => !c.float); // floating topics are placed on their own below
  const cut = root.layout === "map" && !root.collapsed ? Math.ceil(kids.length / 2) : kids.length;
  const right = half({ ...root, children: kids.slice(0, cut) });
  const out: Box[] = right.map((b) => ({ ...b, side: 1, branch: -1 }));

  if (cut < kids.length) {
    const left = half({ ...root, collapsed: false, children: kids.slice(cut) });
    const dy = right[0].y - left[0].y; // line the two roots up
    const rw = right[0].w;
    for (const b of left.slice(1)) out.push({ ...b, x: rw - b.x - b.w, y: b.y + dy, side: -1, branch: -1 });
  }

  for (const f of root.children.filter((c) => c.float)) {
    const raw = half(f);
    const dx = f.float!.x - raw[0].x, dy = f.float!.y - raw[0].y;
    for (const b of raw) out.push({ ...b, x: b.x + dx, y: b.y + dy, depth: b.depth + 1, side: 1, branch: -1 });
  }

  // Branch index = position among all top-level topics, which also drives colours and presentation steps.
  const branch: Record<string, number> = {};
  for (const b of out) {
    if (b.depth === 0) continue;
    branch[b.id] = b.depth === 1 ? root.children.findIndex((k) => k.id === b.id) : branch[b.parent!];
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
    if (id === root.id) return kids.find((k) => !k.float && sideOf(k) === toward)?.id ?? id;
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

export const patchAll = (root: Node, ids: string[], p: Partial<Node>) => ids.reduce((r, id) => patch(r, id, p), root);

export const removeAll = (root: Node, ids: string[]) => ids.reduce((r, id) => remove(r, id), root);

/** Move several topics under `target`, in the order given. Topics inside another moved topic travel with it. */
export function moveAll(root: Node, ids: string[], target: string): Node {
  const set = new Set(ids);
  const inside = (id: string) => {
    for (let p = parentOf(root, id); p; p = parentOf(root, p.id)) if (set.has(p.id)) return true;
    return false;
  };
  return ids.filter((id) => !inside(id)).reduce((r, id) => moveTo(r, id, target), root);
}

/** Drop relationships, boundaries and summaries that point at topics which no longer exist. */
export function prune(root: Node): Node {
  const alive = new Set<string>();
  const walk = (n: Node) => (alive.add(n.id), n.children.forEach(walk));
  walk(root);
  const rels = root.rels?.filter((r) => alive.has(r.from) && alive.has(r.to));
  const bounds = root.bounds?.filter((id) => alive.has(id));
  const summaries = root.summaries?.filter((s) => alive.has(s.from) && alive.has(s.to));
  const same = rels?.length === root.rels?.length && bounds?.length === root.bounds?.length && summaries?.length === root.summaries?.length;
  return same ? root : { ...root, rels, bounds, summaries };
}

/** Delete topics for good (not a move): also drops anything that referred to them. */
export const discard = (root: Node, ids: string[]) => prune(removeAll(root, ids));
