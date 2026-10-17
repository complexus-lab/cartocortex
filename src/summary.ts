import { Box, Node, Summary, parentOf, patch, visibleIds, widthOf } from "./model";

export type SumGeo = { id: string; side: 1 | -1; bx: number; y0: number; y1: number; label: { x: number; y: number; w: number; h: number } };

const H = 34, STEM = 24, TICK = 6;

/** A summary needs two topics (possibly the same one) that share a parent. */
export function canSummarize(root: Node, a: string, b: string) {
  const p = parentOf(root, a);
  return !!p && parentOf(root, b)?.id === p.id;
}

export const addSummary = (root: Node, a: string, b: string, text = "Summary") =>
  patch(root, root.id, { summaries: [...(root.summaries ?? []), { id: crypto.randomUUID(), from: a, to: b, text }] });

export const editSummary = (root: Node, id: string, text: string) =>
  patch(root, root.id, { summaries: (root.summaries ?? []).map((s) => (s.id === id ? { ...s, text } : s)) });

export const removeSummary = (root: Node, id: string) =>
  patch(root, root.id, { summaries: (root.summaries ?? []).filter((s) => s.id !== id) });

/**
 * Where a summary sits: a bracket just past the outermost edge of the spanned siblings (and their visible
 * descendants) with the label further out. Null when the range is stale or hidden under a collapsed topic.
 */
// ponytail: the label is not collision-checked against neighbouring branches; add a layout pass if that bites.
export function summaryGeo(root: Node, boxes: Box[], s: Summary): SumGeo | null {
  const p = parentOf(root, s.from);
  if (!p || p.collapsed || parentOf(root, s.to)?.id !== p.id) return null;
  const i = p.children.findIndex((c) => c.id === s.from), j = p.children.findIndex((c) => c.id === s.to);
  const byId = Object.fromEntries(boxes.map((b) => [b.id, b]));
  const first = byId[p.children[Math.min(i, j)].id];
  if (!first || first.flow !== "right") return null; // summaries are drawn for sideways layouts only
  const side = first.side;
  const bs = p.children
    .slice(Math.min(i, j), Math.max(i, j) + 1)
    .flatMap(visibleIds)
    .map((id) => byId[id])
    .filter((b) => b && b.side === side);
  const y0 = Math.min(...bs.map((b) => b.y)), y1 = Math.max(...bs.map((b) => b.y + b.h));
  const bx = (side === 1 ? Math.max(...bs.map((b) => b.x + b.w)) : Math.min(...bs.map((b) => b.x))) + side * 10;
  const w = widthOf({ id: "", text: s.text, children: [] });
  const lx = side === 1 ? bx + TICK + STEM : bx - TICK - STEM - w;
  return { id: s.id, side, bx, y0, y1, label: { x: lx, y: (y0 + y1) / 2 - H / 2, w, h: H } };
}

/** SVG path of the bracket and the stem running out to the label. */
export function summaryD(g: SumGeo) {
  const d = g.side, x = g.bx, yc = (g.y0 + g.y1) / 2;
  return `M${x} ${g.y0}H${x + TICK * d}V${g.y1}H${x}M${x + TICK * d} ${yc}H${x + (TICK + STEM) * d}`;
}

/** First and last sibling of a selection whose topics all share one parent; null otherwise. */
export function siblingSpan(root: Node, ids: string[]): [string, string] | null {
  const p = ids.length > 1 ? parentOf(root, ids[0]) : undefined;
  if (!p) return null;
  const idx = ids.map((id) => (parentOf(root, id)?.id === p.id ? p.children.findIndex((c) => c.id === id) : -1));
  return idx.includes(-1) ? null : [p.children[Math.min(...idx)].id, p.children[Math.max(...idx)].id];
}
