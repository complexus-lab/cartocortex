export const PRIORITIES = [1, 2, 3, 4, 5];
export const PROGRESS = [0, 25, 50, 75, 100];

const PRIO_FILL = ["#1e3a5f", "#156775", "#0d9488", "#5fb5ad", "#9fd3cf"];

/** Badge colours for priority `p` (clamped to 1-5): darker means more urgent, navy to teal to pale tint. */
export function prioColors(p: number) {
  const i = Math.min(Math.max(Math.round(p), 1), 5) - 1;
  return { bg: PRIO_FILL[i], fg: i < 3 ? "#fff" : "#1e3a5f" };
}

/** XMind task-progress marker ids and the percentage each one stands for. */
export const XM_PROGRESS: Record<string, number> = {
  "task-start": 0, "task-oct": 12.5, "task-quarter": 25, "task-3oct": 37.5, "task-half": 50,
  "task-5oct": 62.5, "task-3quar": 75, "task-7oct": 87.5, "task-done": 100,
};

/** The XMind marker closest to `pct`. */
export const progressMarker = (pct: number) =>
  Object.entries(XM_PROGRESS).reduce((best, e) => (Math.abs(e[1] - pct) < Math.abs(XM_PROGRESS[best] - pct) ? e[0] : best), "task-start");

export const progressText = (pct: number) => (pct >= 100 ? "✓" : `${Math.round(pct)}%`);

/** The XMind markers that stand for one of the editor's icons: any star or flag colour, and four of the symbols. */
const ICON_OF_MARKER: [RegExp, string][] = [[/^star-/, "⭐"], [/^flag-/, "🚩"], [/^symbol-exclam$/, "❗"], [/^symbol-question$/, "❓"], [/^symbol-right$/, "✅"], [/^symbol-wrong$/, "❌"]];

/** The marker to write for each icon; the others (💡 🔥 ⚠️ ❤️) have no XMind id we are sure of, so they are not exported. */
export const MARKER_OF_ICON: Record<string, string> = { "⭐": "star-red", "🚩": "flag-red", "❗": "symbol-exclam", "❓": "symbol-question", "✅": "symbol-right", "❌": "symbol-wrong" };

/** Priority, progress and the first icon from XMind marker ids; other markers (smileys, arrows, people…) have no counterpart. */
export function fromMarkers(ids: string[]): { priority?: number; progress?: number; icon?: string } {
  const prio = ids.map((id) => /^priority-(\d)$/.exec(id)?.[1]).find(Boolean);
  const prog = ids.find((id) => id in XM_PROGRESS);
  const icon = ids.map((id) => ICON_OF_MARKER.find(([re]) => re.test(id))?.[1]).find(Boolean);
  return { ...(prio ? { priority: Number(prio) } : {}), ...(prog ? { progress: XM_PROGRESS[prog] } : {}), ...(icon ? { icon } : {}) };
}

/** How many of these marker ids `fromMarkers` cannot keep. */
export const lostMarkers = (ids: string[]) => ids.length - Object.keys(fromMarkers(ids)).length;
