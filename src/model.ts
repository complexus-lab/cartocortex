import type { Run } from "./rich";
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
  image?: { src: string; w: number; h: number }; // a picture shown as a thumbnail in the topic; src is an embedded data URL
  topicLink?: string; // id of another topic this one points to (a link inside the map)
  priority?: number; // task priority, 1 (most urgent) to 9
  progress?: number; // task progress in percent
  bold?: boolean; // text style, per topic
  italic?: boolean;
  strike?: boolean;
  textColor?: string; // "#rrggbb"
  runs?: Run[]; // per-word style over `text`; ignored once it no longer spells the text
  noteRuns?: Run[]; // the same for `note`
  shape?: Shape;
  float?: { x: number; y: number }; // top-level topics only: free-standing at this canvas position, no branch to the root
  // Document-level settings, only meaningful on the root node.
  layout?: "right" | "left" | "map" | "down" | "tree" | "fish" | "line" | "brace" | "matrix"; // logic chart (right or left), two-sided map, org chart, tree chart, fishbone, timeline, brace map, matrix
  theme?: string;
  themeColors?: string[]; // the "custom" theme: central topic and accent, then six branch colours (#rrggbb)
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
  flow: "right" | "down" | "tree" | "fish" | "line" | "brace" | "matrix"; // how branches run: sideways, top-down (org chart), an indented list (tree chart), along a fishbone or a timeline
  anchor?: { x: number; y: number }; // fishbone and timeline: where this topic's connector starts or meets the line
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

export const rename = (root: Node, id: string, text: string) => (findNode(root, id)?.text === text ? root : patch(root, id, { text, runs: undefined })); // new text: any per-word style is gone

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
  const { rels, bounds, summaries, layout, theme, themeColors, title, float, ...rest } = n;
  void rels, bounds, summaries, layout, theme, themeColors, title, float;
  return { ...rest, id: crypto.randomUUID(), children: n.children.map(clone) };
};

/** `n` plus every descendant that is currently visible (not hidden under a collapsed node). */
export const visibleIds = (n: Node): string[] => [n.id, ...(n.collapsed ? [] : n.children.flatMap(visibleIds))];

const H = 34, GAP_X = 56, GAP_Y = 12;
export const widthOf = (n: Node) =>
  Math.max(56, [...n.text].length * (n.bold ? 9.2 : 8.5) + 28 + (n.icon ? 22 : 0) + (validImage(n.image) ? thumbW(n.image) + 6 : 0) + (n.priority ? 24 : 0) + (n.progress != null ? 24 : 0) + (n.note ? 20 : 0) + (n.link ? 20 : 0));

type Raw = Omit<Box, "side" | "branch" | "flow">;

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

const COL_GAP = 28, ROW_GAP = 56, INDENT = 36;

/** Org chart: children sit in a row below their parent, parents centred over them. */
function vertical(root: Node): Raw[] {
  const out: Raw[] = [];
  let cursor = 0;
  const place = (n: Node, d: number, parent?: string): number => {
    const kids = n.collapsed ? [] : n.children;
    const slot = out.length, start = cursor, w = widthOf(n);
    out.push(null as unknown as Raw); // reserve so parents precede children
    let cx = start + w / 2;
    if (kids.length) {
      const xs = kids.map((c) => place(c, d + 1, n.id));
      cx = (xs[0] + xs[xs.length - 1]) / 2;
      const over = start - (cx - w / 2); // a parent wider than its children must not spill into the previous subtree
      if (over > 0) {
        for (let i = slot + 1; i < out.length; i++) out[i].x += over;
        cx += over;
        cursor += over;
      }
    }
    cursor = Math.max(cursor, cx + w / 2 + COL_GAP);
    out[slot] = { id: n.id, x: cx - w / 2, y: d * (H + ROW_GAP), w, h: H, parent, depth: d };
    return cx;
  };
  place(root, 0);
  return out;
}

/** Tree chart: one row per topic, children indented under their parent. */
function indented(root: Node): Raw[] {
  const out: Raw[] = [];
  const place = (n: Node, d: number, parent?: string) => {
    out.push({ id: n.id, x: d * INDENT, y: out.length * (H + GAP_Y), w: widthOf(n), h: H, parent, depth: d });
    if (!n.collapsed) n.children.forEach((c) => place(c, d + 1, n.id));
  };
  place(root, 0);
  return out;
}

const FISH = { START: 36, GAP: 16, COLGAP: 40, SIDE: 10, NEST: 22 };

/**
 * Fishbone: the root is the head on the right. Top-level topics alternate above and below the spine, each on a
 * slanted bone, with their descendants stacked as rows between the topic and the spine; rows of deeper levels
 * hang to the left of their parent. Coordinates are relative to the head, which sits at x = 0.
 */
function fishbone(root: Node): Raw[] {
  const rowH = H + 8;
  const out: Raw[] = [{ id: root.id, x: 0, y: -H / 2, w: widthOf(root), h: H, depth: 0 }];
  const labels = root.collapsed ? [] : root.children;

  /** One top-level topic and its descendants, positioned relative to the point where its bone meets the spine. */
  const group = (label: Node, sign: 1 | -1): Raw[] => {
    const rows: { n: Node; d: number; parent: string }[] = [];
    const walk = (n: Node, d: number) => {
      if (n.collapsed) return;
      for (const c of n.children) (rows.push({ n: c, d, parent: n.id }), walk(c, d + 1));
    };
    walk(label, 1);
    const dl = rowH * (rows.length + 1) + FISH.GAP; // spine to the topic's centre
    const slant = dl * 0.55;
    const edge = dl - H / 2; // spine to the topic's inner edge, where the bone starts
    const boneX = (y: number) => (-slant * Math.abs(y)) / edge;
    const lw = widthOf(label);
    const boxes: Raw[] = [{ id: label.id, x: -slant - lw / 2, y: sign * dl - H / 2, w: lw, h: H, parent: root.id, depth: 1, anchor: { x: 0, y: 0 } }];
    const at = new Map<string, Raw>([[label.id, boxes[0]]]);
    rows.forEach((r, j) => {
      const yc = sign * (rowH * (rows.length - j) + FISH.GAP);
      const w = widthOf(r.n);
      const onBone = r.d === 1;
      const right = onBone ? boneX(yc) - FISH.SIDE : at.get(r.parent)!.x - FISH.NEST;
      const b: Raw = { id: r.n.id, x: right - w, y: yc - H / 2, w, h: H, parent: r.parent, depth: r.d + 1, ...(onBone ? { anchor: { x: boneX(yc), y: yc } } : {}) };
      boxes.push(b);
      at.set(r.n.id, b);
    });
    return boxes;
  };

  // Columns run leftwards from the head; the first topic goes above the spine, the next below it, and so on.
  let cursor = -FISH.START;
  for (let k = 0; k < labels.length; k += 2) {
    const col = [group(labels[k], -1), ...(labels[k + 1] ? [group(labels[k + 1], 1)] : [])].flat();
    const a = cursor - Math.max(0, ...col.map((b) => b.x + b.w)); // keep the column's right side clear of what is already placed
    for (const b of col) out.push({ ...b, x: b.x + a, anchor: b.anchor && { x: b.anchor.x + a, y: b.anchor.y } });
    cursor = a + Math.min(...col.map((b) => b.x)) - FISH.COLGAP;
  }
  return out;
}

const TL = { GAP: 36, ROW: 14, NEST: 24 };

/**
 * Timeline: the root starts a horizontal line and the top-level topics sit on it, in order. Each topic's
 * descendants stack in a column under it (first topic), above it (second), and so on, indented by depth.
 */
function timeline(root: Node, alternate = true): Raw[] {
  const rowH = H + GAP_Y;
  const head: Raw = { id: root.id, x: 0, y: -H / 2, w: widthOf(root), h: H, depth: 0 };
  const out: Raw[] = [head];
  let cursor = head.w + TL.GAP;
  let prevRight = head.w;
  (root.collapsed ? [] : root.children).forEach((label, k) => {
    const below = !alternate || k % 2 === 0; // a matrix hangs every stack below
    const lw = widthOf(label);
    const lbl: Raw = { id: label.id, x: cursor, y: -H / 2, w: lw, h: H, parent: root.id, depth: 1, anchor: { x: prevRight, y: 0 } };
    out.push(lbl);
    const at = new Map<string, Raw>([[label.id, lbl]]);
    let right = cursor + lw, j = 0;
    const walk = (n: Node, d: number) => {
      if (n.collapsed) return;
      for (const c of n.children) {
        const w = widthOf(c), x = at.get(n.id)!.x + TL.NEST;
        const off = TL.ROW + j++ * rowH; // distance of the row's near edge from the line
        const b: Raw = { id: c.id, x, y: below ? H / 2 + off : -(H / 2 + off) - H, w, h: H, parent: n.id, depth: d + 1 };
        out.push(b);
        at.set(c.id, b);
        right = Math.max(right, x + w);
        walk(c, d + 1);
      }
    };
    walk(label, 1);
    prevRight = lbl.x + lw;
    cursor = right + TL.GAP;
  });
  return out;
}

/**
 * "right": everything grows right. "map": top-level branches split between right and left of the root.
 * "down": org chart. "tree": indented tree chart. "fish": fishbone. "line": timeline.
 */
export function layout(root: Node): Box[] {
  const kids = root.children.filter((c) => !c.float); // floating topics are placed on their own below
  const flows: Record<string, Box["flow"]> = { down: "down", tree: "tree", fish: "fish", line: "line", matrix: "matrix", brace: "brace" };
  const flow = flows[root.layout ?? ""] ?? "right";
  const out: Box[] = [];

  if (flow !== "right" && flow !== "brace") {
    const raw = { down: vertical, tree: indented, fish: fishbone, line: timeline, matrix: (r: Node) => timeline(r, false) }[flow]({ ...root, children: kids });
    out.push(...raw.map((b): Box => ({ ...b, side: 1, branch: -1, flow })));
  } else {
    // Sideways structures share one geometry: "right" and "brace" grow right, "left" grows left, "map" splits both ways.
    const cut = root.collapsed ? kids.length : root.layout === "map" ? Math.ceil(kids.length / 2) : root.layout === "left" ? 0 : kids.length;
    const right = half({ ...root, children: kids.slice(0, cut) });
    out.push(...right.map((b): Box => ({ ...b, side: 1, branch: -1, flow })));

    if (cut < kids.length) {
      const left = half({ ...root, collapsed: false, children: kids.slice(cut) });
      const dy = right[0].y - left[0].y; // line the two roots up
      const rw = right[0].w;
      for (const b of left.slice(1)) out.push({ ...b, x: rw - b.x - b.w, y: b.y + dy, side: -1, branch: -1, flow });
    }
  }

  for (const f of root.children.filter((c) => c.float)) {
    const raw = half(f);
    const dx = f.float!.x - raw[0].x, dy = f.float!.y - raw[0].y;
    for (const b of raw) out.push({ ...b, x: b.x + dx, y: b.y + dy, depth: b.depth + 1, side: 1, branch: -1, flow: "right" });
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
  const firstKid = () => (findNode(root, id)!.collapsed ? undefined : findNode(root, id)!.children.find((c) => !c.float))?.id ?? id;
  if (me.flow === "down") {
    if (dir === "up") return me.parent ?? id;
    if (dir === "down") return firstKid();
    const row = boxes.filter((b) => b.flow === "down" && b.depth === me.depth).sort((a, b) => a.x - b.x);
    return (row[row.findIndex((b) => b.id === id) + (dir === "right" ? 1 : -1)] ?? me).id;
  }
  if (me.flow === "line" || me.flow === "matrix") {
    const stops = boxes.filter((b) => b.flow === me.flow && b.depth <= 1); // the head, then the topics on the line
    if (me.depth <= 1) {
      if (dir === "left" || dir === "right") return (stops[stops.findIndex((b) => b.id === id) + (dir === "right" ? 1 : -1)] ?? me).id;
      const k = root.children.filter((c) => !c.float).findIndex((c) => c.id === id);
      return me.depth === 1 && (dir === "down") === (me.flow === "matrix" || k % 2 === 0) ? firstKid() : id; // into the stack, on the side it hangs
    }
    if (dir === "left") return me.parent ?? id;
    if (dir === "right") return firstKid();
    const order = boxes.filter((b) => b.flow === me.flow); // document order
    const outward = dir === (me.y > 0 ? "down" : "up");
    const next = order[order.findIndex((b) => b.id === id) + (outward ? 1 : -1)];
    return (next && next.depth >= (outward ? 2 : 1) ? next : me).id;
  }
  if (me.flow === "fish") {
    if (dir === "right") return me.parent ?? id; // towards the head
    if (dir === "left") return firstKid();
    const order = boxes.filter((b) => b.flow === "fish"); // document order
    return (order[order.findIndex((b) => b.id === id) + (dir === "down" ? 1 : -1)] ?? me).id;
  }
  if (me.flow === "tree") {
    if (dir === "left") return me.parent ?? id;
    if (dir === "right") return firstKid();
    const rows = boxes.filter((b) => b.flow === "tree").sort((a, b) => a.y - b.y);
    return (rows[rows.findIndex((b) => b.id === id) + (dir === "down" ? 1 : -1)] ?? me).id;
  }
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

/** Expand every collapsed ancestor of `id` so the topic can be seen. Returns `root` itself when nothing was collapsed. */
export function reveal(root: Node, id: string): Node {
  const above: string[] = [];
  for (let p = parentOf(root, id); p; p = parentOf(root, p.id)) if (p.collapsed) above.push(p.id);
  return above.reduce((r, pid) => map(r, pid, (n) => ({ ...n, collapsed: false })), root);
}

/** Width of a topic's thumbnail: 22px tall, never narrower than 14px or wider than 48px. */
export const thumbW = (i: { w: number; h: number }) => Math.max(14, Math.min(48, Math.round((22 * i.w) / i.h)));

/** True for an embedded PNG, JPEG, GIF or WebP of sane size. Maps can come from anywhere, so nothing else is ever drawn (no SVG, no URLs). */
export const validImage = (i: Node["image"]): i is NonNullable<Node["image"]> =>
  !!i &&
  typeof i.src === "string" &&
  i.src.length <= 1_000_000 &&
  /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(i.src) &&
  Number.isFinite(i.w) && Number.isFinite(i.h) && i.w > 0 && i.h > 0 && i.w <= 4000 && i.h <= 4000;
