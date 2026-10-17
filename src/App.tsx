import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Node, addChild, addSibling, clone, findNode, discard, layout, mk, moveAll, neighbour, parentOf, patch, patchAll, rename,
  search, toMarkdown, toggle, visibleIds,
} from "./model";
import { exportXmind } from "./xmind";
import { toOpml } from "./outline-io";
import { Opened, baseName, confirmDiscard, docBytes, download, extOf, keepsPath, loadRecent, parseDoc, pickOpen, pickSavePath, pushRecent, readPath, saveRecent, writePath } from "./files";
import { Book, bookJson, parseBook, sheetTitle } from "./book";
import { branchD, braces, mapSvg, mapToPdf, mapToPng, relD } from "./export";
import Outline from "./Outline";
import { normalizeUrl } from "./links";
import { PRIORITIES, PROGRESS, prioColors } from "./task";
import { textStyle } from "./textstyle";
import RichEdit from "./RichEdit";
import { runStyle, validRuns } from "./rich";
import { addSummary, canSummarize, editSummary, removeSummary, siblingSpan, summaryD, summaryGeo } from "./summary";

type S = { root: Node; past: Node[]; future: Node[]; sel: string; edit: string | null };
type Hist = { past: Node[]; future: Node[]; sel: string };
// Sheets. The open sheet lives in `S`; `roots[cur]` here is stale until the sheet is parked (see `park` below).
type Sheets = { roots: Node[]; hist: Hist[]; cur: number };
const emptyHist = (r: Node): Hist => ({ past: [], future: [], sel: r.id });

const THEMES: Record<string, { name: string; root: string; accent: string; palette: string[] }> = {
  classic: { name: "Glossolalie", root: "#0d9488", accent: "#0d9488", palette: ["#0d9488", "#1e3a5f", "#156775", "#3d5f8a", "#0a6f66", "#5e7fa3"] },
  ocean: { name: "Ocean", root: "#0b6e99", accent: "#0b6e99", palette: ["#1098ad", "#3b5bdb", "#1971c2", "#0ca678", "#7048e8", "#15aabf"] },
  forest: { name: "Forest", root: "#2b8a3e", accent: "#2b8a3e", palette: ["#5c940d", "#2f9e44", "#099268", "#e67700", "#a61e4d", "#4263eb"] },
  sunset: { name: "Sunset", root: "#d9480f", accent: "#d9480f", palette: ["#f03e3e", "#f76707", "#fab005", "#d6336c", "#ae3ec9", "#e8590c"] },
  mono: { name: "Mono", root: "#343a40", accent: "#343a40", palette: ["#495057", "#868e96", "#6c757d", "#343a40", "#adb5bd", "#212529"] },
};
const ICONS = ["⭐", "❗", "❓", "✅", "❌", "💡", "🔥", "🚩", "⚠️", "❤️"];
const SHAPES = [["round", "Round"], ["rect", "Box"], ["line", "Line"]] as const;

const KEY = "mindmap.autosave";
const load = (): Book => {
  try {
    return parseBook(localStorage.getItem(KEY) ?? "");
  } catch {
    return { roots: [{ ...mk("Central topic"), children: [mk("Branch 1"), mk("Branch 2")] }], cur: 0 };
  }
};

const isTauri = "__TAURI_INTERNALS__" in window;

async function saveFile(name: string, ext: string, content: string | Uint8Array) {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: name, filters: [{ name: ext, extensions: [ext] }] });
    if (path) await writeFile(path, bytes);
  } else {
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([bytes as BlobPart])),
      download: name,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

/** Open a topic link in the system browser. Only http(s) and mailto links are allowed. */
async function openLink(raw: string) {
  const url = normalizeUrl(raw);
  if (!url) return alert(`This link cannot be opened: ${raw}`);
  if (isTauri) await (await import("@tauri-apps/plugin-opener")).openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function App() {
  const [sheets, setSheets] = useState<Sheets>(() => {
    const b = load();
    return { roots: b.roots, hist: b.roots.map(emptyHist), cur: b.cur };
  });
  const [s, setS] = useState<S>(() => {
    const root = sheets.roots[sheets.cur];
    return { root, past: [], future: [], sel: root.id, edit: null };
  });
  const [docPath, setDocPath] = useState<string | null>(null); // where the document lives on disk (desktop app)
  const [dirty, setDirty] = useState(false); // changed since it was last saved or opened
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const savedJson = useRef<string | null>(null); // the document as last saved or opened
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [renaming, setRenaming] = useState<number | null>(null); // sheet tab being renamed
  const [delAsk, setDelAsk] = useState<number | null>(null); // sheet tab awaiting delete confirmation
  const [view, setView] = useState({ x: 80, y: Math.round(window.innerHeight / 2) - 40, k: 1 });
  const [panel, setPanel] = useState(true);
  const [mode, setMode] = useState<"map" | "outline">("map");
  const [linking, setLinking] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [sumSel, setSumSel] = useState<string | null>(null);
  const [sumEdit, setSumEdit] = useState<string | null>(null);
  const [present, setPresent] = useState<number | null>(null); // presentation step, null = off
  const [group, setGroup] = useState<string[]>([]); // multi-selection; only counts while it contains the primary topic
  const [marq, setMarq] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null); // floating topic being moved
  const [relSel, setRelSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hit, setHit] = useState(-1);
  const [doc, setDoc] = useState(0); // bumps when a different document is loaded
  const stage = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const clip = useRef<Node | null>(null);

  const theme = THEMES[s.root.theme ?? "classic"] ?? THEMES.classic;
  const boxes = useMemo(() => layout(s.root), [s.root]);
  const byId = useMemo(() => Object.fromEntries(boxes.map((b) => [b.id, b])), [boxes]);
  const byNode = useMemo(() => {
    const m: Record<string, Node> = {};
    const walk = (n: Node) => ((m[n.id] = n), n.children.forEach(walk));
    walk(s.root);
    return m;
  }, [s.root]);
  const hits = useMemo(() => search(s.root, q).filter((id) => byId[id]), [s.root, q, byId]);
  const colorOf = (b: Box) => byNode[b.id].color ?? (b.branch < 0 ? theme.root : theme.palette[b.branch % theme.palette.length]);
  const selNode = byNode[s.sel];
  // Selected topics in layout order. The primary topic (`s.sel`) is always part of it.
  const ids = useMemo(() => (group.includes(s.sel) ? boxes.filter((b) => group.includes(b.id)).map((b) => b.id) : [s.sel]), [group, s.sel, boxes]);
  const picked = useMemo(() => new Set(ids), [ids]);
  const multi = ids.length > 1;
  const sums = useMemo(
    () => (s.root.summaries ?? []).flatMap((x) => {
      const g = summaryGeo(s.root, boxes, x);
      return g ? [{ x, g }] : [];
    }),
    [s.root, boxes],
  );
  // Presenting reveals one top-level branch per step; the root is always shown.
  const steps = (s.root.collapsed ? 0 : s.root.children.length) + 1;
  const shown = (id: string) => present === null || (byId[id]?.branch ?? 0) < present;

  useEffect(() => {
    const json = bookJson(park().roots, sheets.cur);
    try {
      localStorage.setItem(KEY, json);
    } catch {
      /* storage unavailable: autosave is best-effort */
    }
    savedJson.current ??= json; // the first document counts as saved
    setDirty(json !== savedJson.current);
  }, [s.root, sheets]);

  /** Apply an edit to the tree, recording undo history. */
  const commit = (fn: (r: Node) => Node, sel?: string, edit: string | null = null) =>
    setS((p) => {
      const root = fn(p.root);
      return root === p.root ? p : { root, past: [...p.past, p.root], future: [], sel: sel ?? p.sel, edit };
    });
  const setNode = (p: Partial<Node>) => commit((r) => patchAll(r, ids, p));
  const setDocProp = (p: Partial<Node>) => commit((r) => patch(r, r.id, p));
  // With the cursor in a topic or in the notes, style the selected words (browser editing command); otherwise the whole topic.
  const fmt = (cmd: string, topic: Partial<Node>, arg?: string) =>
    (document.activeElement as HTMLElement | null)?.isContentEditable ? document.execCommand(cmd, false, arg) : setNode(topic);

  const undo = () =>
    setS((p) => {
      const root = p.past.at(-1);
      if (!root) return p;
      return { root, past: p.past.slice(0, -1), future: [p.root, ...p.future], sel: findNode(root, p.sel) ? p.sel : root.id, edit: null };
    });
  const redo = () =>
    setS((p) => {
      const [root, ...future] = p.future;
      if (!root) return p;
      return { root, past: [...p.past, p.root], future, sel: findNode(root, p.sel) ? p.sel : root.id, edit: null };
    });

  const newChild = () => {
    const n = mk();
    commit((r) => addChild(r, s.sel, n), n.id, n.id);
  };
  const newSibling = () => {
    const n = mk();
    commit((r) => addSibling(r, s.sel, n), n.id, n.id);
  };
  /** New free-standing topic with its top-left corner at canvas position (x, y). */
  const newFloat = (x: number, y: number) => {
    const n = { ...mk(), float: { x, y } };
    commit((r) => addChild(r, r.id, n), n.id, n.id);
  };
  const floatAtCentre = () => {
    const el = stage.current;
    if (el?.clientWidth) newFloat((el.clientWidth / 2 - view.x) / view.k - 28, (el.clientHeight / 2 - view.y) / view.k - 17);
  };
  const del = () => {
    if (sumSel) {
      commit((r) => removeSummary(r, sumSel));
      return setSumSel(null);
    }
    if (relSel) {
      commit((r) => patch(r, r.id, { rels: (r.rels ?? []).filter((x) => x.id !== relSel) }));
      return setRelSel(null);
    }
    if (multi) {
      const tops = ids.filter((id) => id !== s.root.id);
      const keep = parentOf(s.root, tops[0])?.id;
      commit((r) => discard(r, tops), keep && !tops.includes(keep) ? keep : s.root.id);
      return setGroup([]);
    }
    const p = parentOf(s.root, s.sel);
    if (p) commit((r) => discard(r, [s.sel]), p.id);
  };
  const copy = () => void (clip.current = selNode);
  const paste = () => {
    if (!clip.current) return;
    const n = clone(clip.current);
    commit((r) => addChild(r, s.sel, n), n.id);
  };
  const duplicate = () => {
    const n = clone(selNode);
    commit((r) => addSibling(r, s.sel, n), n.id);
  };
  const toggleBound = () =>
    commit((r) => {
      const b = r.bounds ?? [];
      return patch(r, r.id, { bounds: b.includes(s.sel) ? b.filter((x) => x !== s.sel) : [...b, s.sel] });
    });
  const linkTo = (to: string) => {
    commit((r) => patch(r, r.id, { rels: [...(r.rels ?? []), { id: crypto.randomUUID(), from: s.sel, to }] }));
    setLinking(false);
  };

  const fileName = (ext: string) => `${s.root.text.replace(/[\\/:*?"<>|]/g, "_") || "cartocortex"}.${ext}`;

  /** The document is now what's on disk at `path` (null in the browser, where there is no path). */
  const markSaved = (path: string | null, json = bookJson(park().roots, sheets.cur)) => {
    savedJson.current = json;
    setDirty(false);
    setDocPath(path);
    if (path) {
      const next = pushRecent(recent, path);
      saveRecent(next);
      setRecent(next);
    }
  };
  /** Save: overwrite the current file, or ask where to put it. `asNew` always asks. */
  const saveDoc = async (asNew = false) => {
    try {
      const roots = park().roots;
      if (!isTauri) return (download(fileName("json"), docBytes("map.json", roots, sheets.cur)), markSaved(null));
      let path = !asNew && docPath ? docPath : await pickSavePath(docPath ? baseName(docPath) : fileName("json"));
      if (!path) return;
      if (!extOf(path)) path += ".json";
      await writePath(path, docBytes(path, roots, sheets.cur));
      markSaved(path);
    } catch (e) {
      alert(`Could not save: ${(e as Error).message}`);
    }
  };
  const loadOpened = async (f: Opened) => {
    const book = await parseDoc(f.name, f.bytes);
    openSheet(book.cur, { roots: book.roots, hist: book.roots.map(emptyHist), cur: book.cur });
    // Any format but our own JSON is an import: the map stays "unsaved", so Save asks for a new file instead of overwriting the original.
    const own = keepsPath(f.name);
    markSaved(own ? f.path : null, own ? bookJson(book.roots, book.cur) : "");
  };
  const open = async (path?: string) => {
    try {
      if (dirtyRef.current && !(await confirmDiscard())) return;
      const f = path ? await readPath(path) : await pickOpen();
      if (f) await loadOpened(f);
    } catch (e) {
      alert(`Could not open file: ${(e as Error).message}`);
    }
  };
  const newDoc = async () => {
    if (dirtyRef.current && !(await confirmDiscard())) return;
    const root = { ...mk("Central topic"), children: [mk("Branch 1"), mk("Branch 2")] };
    openSheet(0, { roots: [root], hist: [emptyHist(root)], cur: 0 });
    markSaved(null, bookJson([root], 0));
  };

  // The window title shows the file name, with a bullet while there are unsaved changes.
  useEffect(() => {
    const title = `${dirty ? "• " : ""}${docPath ? baseName(docPath) : "Untitled"} — Cartocortex`;
    document.title = title;
    if (isTauri) import("@tauri-apps/api/window").then((w) => w.getCurrentWindow().setTitle(title)).catch(() => {});
  }, [docPath, dirty]);

  // Ask before closing the window with unsaved changes.
  useEffect(() => {
    if (!isTauri) {
      const warn = (e: BeforeUnloadEvent) => dirtyRef.current && e.preventDefault();
      window.addEventListener("beforeunload", warn);
      return () => window.removeEventListener("beforeunload", warn);
    }
    let off: (() => void) | undefined, stopped = false;
    import("@tauri-apps/api/window")
      .then((w) =>
        w.getCurrentWindow().onCloseRequested(async (e) => {
          if (dirtyRef.current && !(await confirmDiscard())) e.preventDefault();
        }),
      )
      .then((un) => (stopped ? un() : (off = un)))
      .catch(() => {});
    return () => {
      stopped = true;
      off?.();
    };
  }, []);

  // Other sheets sit in `sheets` with their own undo history; the open one is `s`, folded back in by `park`.
  const park = (): Sheets => ({
    ...sheets,
    roots: sheets.roots.map((r, i) => (i === sheets.cur ? s.root : r)),
    hist: sheets.hist.map((h, i) => (i === sheets.cur ? { past: s.past, future: s.future, sel: s.sel } : h)),
  });
  const openSheet = (to: number, b: Sheets) => {
    const root = b.roots[to], h = b.hist[to];
    setSheets({ ...b, cur: to });
    setS({ root, past: h.past, future: h.future, sel: findNode(root, h.sel) ? h.sel : root.id, edit: null });
    setGroup([]);
    setRelSel(null);
    setSumSel(null);
    setRenaming(null);
    setDelAsk(null);
    setDoc((d) => d + 1);
  };
  const switchSheet = (to: number) => to !== sheets.cur && openSheet(to, park());
  const addSheet = () => {
    const b = park(), root = { ...mk("Central topic"), theme: s.root.theme, layout: s.root.layout };
    openSheet(b.roots.length, { ...b, roots: [...b.roots, root], hist: [...b.hist, emptyHist(root)] });
  };
  const deleteSheet = (i: number) => {
    const b = park();
    if (b.roots.length < 2) return;
    const roots = b.roots.filter((_, k) => k !== i), hist = b.hist.filter((_, k) => k !== i);
    openSheet(i === sheets.cur ? Math.min(i, roots.length - 1) : sheets.cur - (sheets.cur > i ? 1 : 0), { ...b, roots, hist });
  };
  const exportImage = async (kind: "png" | "pdf") => {
    try {
      const m = mapSvg(s.root, boxes, colorOf);
      await saveFile(fileName(kind), kind, kind === "png" ? await mapToPng(m) : await mapToPdf(m));
    } catch (e) {
      alert(`Could not export: ${(e as Error).message}`);
    }
  };

  const fitTo = (bs: Box[]) => {
    const el = stage.current;
    if (!el || !el.clientWidth || !bs.length) return; // hidden while the outline is showing
    const x0 = Math.min(...bs.map((b) => b.x)), x1 = Math.max(...bs.map((b) => b.x + b.w));
    const y0 = Math.min(...bs.map((b) => b.y)), y1 = Math.max(...bs.map((b) => b.y + b.h));
    const k = Math.min(1.5, (el.clientWidth - 100) / (x1 - x0), (el.clientHeight - 100) / (y1 - y0));
    setView({ k, x: (el.clientWidth - (x1 - x0) * k) / 2 - x0 * k, y: (el.clientHeight - (y1 - y0) * k) / 2 - y0 * k });
  };
  const fit = () => fitTo([...boxes, ...sums.map(({ g }) => ({ ...g.label }) as Box)]); // summary labels sit outside the topic boxes
  useEffect(fit, [doc, s.root.layout]);

  const startPresenting = () => {
    setMode("map");
    setPresent(0);
    document.documentElement.requestFullscreen?.().catch(() => {}); // optional; some webviews refuse it
  };
  const stopPresenting = () => {
    setPresent(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  // Camera follows the newest branch (plus the root) at each step.
  useEffect(() => {
    if (present !== null) fitTo(boxes.filter((b) => b.branch < 0 || b.branch === present - 1));
  }, [present, boxes, mode]);
  useEffect(() => {
    const onFs = () => document.fullscreenElement || setPresent(null);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const nextHit = () => {
    if (!hits.length) return;
    const i = (hit + 1) % hits.length;
    setHit(i);
    setS((p) => ({ ...p, sel: hits[i] }));
  };

  // Keyboard-first editing (XMind-style).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (present !== null) {
        const next = ["ArrowRight", "ArrowDown", " ", "Enter", "PageDown"], prev = ["ArrowLeft", "ArrowUp", "Backspace", "PageUp"];
        if (e.key === "Escape") stopPresenting();
        else if (next.includes(e.key)) setPresent(Math.min(steps - 1, present + 1));
        else if (prev.includes(e.key)) setPresent(Math.max(0, present - 1));
        else return;
        return e.preventDefault();
      }
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "f") return void (e.preventDefault(), searchBox.current?.focus());
      if (s.edit || (e.target as HTMLElement).closest("input,textarea,select,[contenteditable='true']")) return; // fields handle their own keys
      const go = (dir: "left" | "right" | "up" | "down") => setS((p) => ({ ...p, sel: neighbour(p.root, layout(p.root), p.sel, dir) }));
      if (mod) {
        const m: Record<string, () => void> = {
          z: e.shiftKey ? redo : undo, s: () => saveDoc(e.shiftKey), o: () => open(), n: newDoc, c: copy, v: paste, d: duplicate, a: () => setGroup(boxes.map((b) => b.id)),
          b: () => setNode({ bold: selNode.bold ? undefined : true }),
          i: () => setNode({ italic: selNode.italic ? undefined : true }),
          x: () => (copy(), del()),
        };
        if (m[k] && !e.altKey) (e.preventDefault(), m[k]());
        return;
      }
      if (e.altKey) return;
      const actions: Record<string, () => void> = {
        tab: newChild,
        enter: newSibling,
        " ": () => setS((p) => ({ ...p, edit: p.sel })),
        f2: () => setS((p) => ({ ...p, edit: p.sel })),
        delete: del,
        backspace: del,
        escape: () => (setLinking(false), setSummarizing(false), setRelSel(null), setSumSel(null), setGroup([])),
        arrowleft: () => go("left"),
        arrowright: () => go("right"),
        arrowup: () => go("up"),
        arrowdown: () => go("down"),
      };
      if (actions[k]) (e.preventDefault(), actions[k]());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Wheel pans; ctrl/cmd+wheel (and trackpad pinch) zooms. Needs a non-passive listener.
  useEffect(() => {
    const el = stage.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) =>
        e.ctrlKey || e.metaKey
          ? { ...v, k: Math.min(3, Math.max(0.25, v.k * Math.exp(-e.deltaY * 0.01))) }
          : { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY },
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the selected node on screen.
  useEffect(() => {
    const b = byId[s.sel];
    const el = stage.current;
    if (!b || !el) return;
    setView((v) => {
      const x0 = v.x + b.x * v.k, x1 = x0 + b.w * v.k, y0 = v.y + b.y * v.k, y1 = y0 + b.h * v.k;
      const dx = x0 < 20 ? 20 - x0 : x1 > el.clientWidth - 20 ? el.clientWidth - 20 - x1 : 0;
      const dy = y0 < 60 ? 60 - y0 : y1 > el.clientHeight - 20 ? el.clientHeight - 20 - y1 : 0;
      return dx || dy ? { ...v, x: v.x + dx, y: v.y + dy } : v;
    });
  }, [s.sel, byId]);

  /** Drag a floating topic with the pointer. Releasing over another topic attaches it there. One undo step. */
  const startFloatDrag = (e: React.PointerEvent, b: Box) => {
    const startRoot = s.root, k = view.k;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (m: PointerEvent) => {
      const dx = (m.clientX - sx) / k, dy = (m.clientY - sy) / k;
      if (!moved && Math.hypot(dx, dy) * k < 4) return; // a click, not a drag
      moved = true;
      setDragging(b.id);
      setS((p) => ({ ...p, root: patch(p.root, b.id, { float: { x: b.x + dx, y: b.y + dy } }) }));
    };
    const up = (m: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(null);
      if (!moved) return;
      const under = document.elementFromPoint(m.clientX, m.clientY)?.closest<HTMLElement>("[data-id]")?.dataset.id;
      setS((p) => ({ ...p, root: under && under !== b.id ? moveAll(p.root, [b.id], under) : p.root, past: [...p.past, startRoot], future: [] }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Shift-drag on empty canvas draws a selection box; ⌘/Ctrl-drag adds to the current selection.
  const marquee = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const base = e.metaKey || e.ctrlKey ? ids : [];
    const rect = (m: { clientX: number; clientY: number }) => ({ x0: sx, y0: sy, x1: m.clientX - r.left, y1: m.clientY - r.top });
    const move = (m: PointerEvent) => setMarq(rect(m));
    const up = (m: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMarq(null);
      const q = rect(m);
      const [ax, bx] = [q.x0, q.x1].sort((a, b) => a - b).map((v) => (v - view.x) / view.k);
      const [ay, by] = [q.y0, q.y1].sort((a, b) => a - b).map((v) => (v - view.y) / view.k);
      const hit = boxes.filter((b) => shown(b.id) && b.x < bx && b.x + b.w > ax && b.y < by && b.y + b.h > ay).map((b) => b.id);
      const all = [...new Set([...base, ...hit])];
      setGroup(all);
      if (all.length) setS((p) => ({ ...p, sel: all.includes(p.sel) ? p.sel : all[0], edit: null }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const pan = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey) return marquee(e);
    const start = { px: e.clientX, py: e.clientY, ...view };
    const move = (m: PointerEvent) => setView((v) => ({ ...v, x: start.x + m.clientX - start.px, y: start.y + m.clientY - start.py }));
    const up = () => (window.removeEventListener("pointermove", move), window.removeEventListener("pointerup", up));
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    setS((p) => ({ ...p, edit: null }));
    setRelSel(null);
    setSumSel(null);
    setGroup([]);
  };

  const rels = (s.root.rels ?? []).filter((r) => byId[r.from] && byId[r.to] && shown(r.from) && shown(r.to));
  const bounds = (s.root.bounds ?? []).filter((id) => byId[id] && shown(id));

  return (
    <div className={`app${present !== null ? " present" : ""}`} style={{ "--accent": theme.accent } as React.CSSProperties}>
      <div className="toolbar">
        <button onClick={newChild}>Child <kbd>Tab</kbd></button>
        <button onClick={newSibling}>Sibling <kbd>↵</kbd></button>
        <button onClick={del}>Delete <kbd>⌫</kbd></button>
        <button onClick={floatAtCentre} title="Free-standing topic (or double-click the canvas)">Float</button>
        <span className="sep" />
        <button onClick={undo} disabled={!s.past.length}>Undo</button>
        <button onClick={redo} disabled={!s.future.length}>Redo</button>
        <span className="sep" />
        <button className={linking ? "on" : ""} onClick={() => setLinking(!linking)} title="Click this, then click the target topic">
          {linking ? "Pick target…" : "Relationship"}
        </button>
        <button className={s.root.bounds?.includes(s.sel) ? "on" : ""} onClick={toggleBound}>Boundary</button>
        <button
          className={summarizing ? "on" : ""}
          onClick={() => {
            const span = siblingSpan(s.root, ids);
            if (span) commit((r) => addSummary(r, span[0], span[1]));
            else setSummarizing(!summarizing);
          }}
          title="Select several sibling topics first, or click this and then the last topic of the range"
        >
          {summarizing ? "Pick range end…" : "Summary"}
        </button>
        <span className="sep" />
        <select value={s.root.layout ?? "right"} onChange={(e) => setDocProp({ layout: e.target.value as Node["layout"] })} title="Structure">
          <option value="right">Logic (right)</option>
          <option value="left">Logic (left)</option>
          <option value="map">Map (both sides)</option>
          <option value="down">Org chart (down)</option>
          <option value="tree">Tree (indented)</option>
          <option value="fish">Fishbone</option>
          <option value="line">Timeline</option>
          <option value="brace">Brace</option>
          <option value="matrix">Matrix</option>
        </select>
        <select value={s.root.theme ?? "classic"} onChange={(e) => setDocProp({ theme: e.target.value })} title="Theme">
          {Object.entries(THEMES).map(([id, t]) => <option key={id} value={id}>{t.name}</option>)}
        </select>
        <input
          ref={searchBox}
          className="search"
          placeholder={`Find ⌘F${q ? ` (${hits.length})` : ""}`}
          value={q}
          onChange={(e) => (setQ(e.target.value), setHit(-1))}
          onKeyDown={(e) => {
            if (e.key === "Enter") nextHit();
            if (e.key === "Escape") (setQ(""), e.currentTarget.blur());
          }}
        />
        <span className="sep" />
        <button onClick={newDoc} title="New map (⌘N)">New</button>
        <button onClick={() => open()} title="Open a map (⌘O)">Open…</button>
        {isTauri && recent.length > 0 && (
          <select value="" title="Recent files" onChange={(e) => e.target.value && open(e.target.value)}>
            <option value="">Recent…</option>
            {recent.map((p) => <option key={p} value={p} title={p}>{baseName(p)}</option>)}
          </select>
        )}
        <button className={dirty ? "on" : ""} onClick={() => saveDoc()} title={dirty ? "Save: unsaved changes (⌘S)" : "Save (⌘S)"}>Save</button>
        {isTauri && <button onClick={() => saveDoc(true)} title="Save under a new name (⇧⌘S)">Save as…</button>}
        <button onClick={() => saveFile(fileName("xmind"), "xmind", exportXmind(park().roots))}>Export XMind</button>
        <button onClick={() => saveFile(fileName("md"), "md", toMarkdown(s.root))}>Export MD</button>
        <button onClick={() => saveFile(fileName("opml"), "opml", toOpml(park().roots))}>Export OPML</button>
        <button onClick={() => exportImage("png")}>PNG</button>
        <button onClick={() => exportImage("pdf")}>PDF</button>
        <span className="sep" />
        <button className={mode === "outline" ? "on" : ""} onClick={() => setMode(mode === "map" ? "outline" : "map")}>Outline</button>
        <button onClick={startPresenting}>Present</button>
        <button onClick={fit} disabled={mode === "outline"}>Fit</button>
        <button className={panel ? "on" : ""} onClick={() => setPanel(!panel)}>Panel</button>
      </div>
      <div className="tabs">
        {sheets.roots.map((r0, i) => {
          const r = i === sheets.cur ? s.root : r0;
          return (
            <div
              key={r0.id}
              className={`tab${i === sheets.cur ? " on" : ""}`}
              onClick={() => switchSheet(i)}
              onDoubleClick={() => (switchSheet(i), setRenaming(i))}
              onMouseLeave={() => delAsk === i && setDelAsk(null)}
            >
              {renaming === i ? (
                <input
                  autoFocus
                  defaultValue={sheetTitle(r, i)}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    setRenaming(null);
                    if (e.target.value.trim() !== sheetTitle(r, i)) setDocProp({ title: e.target.value.trim() || undefined });
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <span>{sheetTitle(r, i)}</span>
              )}
              {sheets.roots.length > 1 && (
                <button
                  className="x"
                  title={delAsk === i ? "Click again to delete this sheet" : "Delete sheet"}
                  onClick={(e) => (e.stopPropagation(), delAsk === i ? deleteSheet(i) : setDelAsk(i))}
                >
                  {delAsk === i ? "Delete?" : "×"}
                </button>
              )}
            </div>
          );
        })}
        <button className="add" onClick={addSheet} title="New sheet">+</button>
      </div>
      <div className="main">
        {mode === "outline" && <Outline root={s.root} sel={s.sel} commit={commit} onSelect={(id) => setS((p) => (p.sel === id ? p : { ...p, sel: id }))} />}
        <div
          className="stage"
          ref={stage}
          onPointerDown={pan}
          onDoubleClick={(e) => {
            if (e.target !== e.currentTarget || present !== null) return;
            const r = e.currentTarget.getBoundingClientRect();
            newFloat((e.clientX - r.left - view.x) / view.k - 28, (e.clientY - r.top - view.y) / view.k - 17);
          }} style={mode === "outline" ? { display: "none" } : undefined}>
          <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
            {bounds.map((id) => {
              const bs = visibleIds(byNode[id]).map((x) => byId[x]);
              const x0 = Math.min(...bs.map((b) => b.x)) - 12, y0 = Math.min(...bs.map((b) => b.y)) - 12;
              const x1 = Math.max(...bs.map((b) => b.x + b.w)) + 12, y1 = Math.max(...bs.map((b) => b.y + b.h)) + 12;
              return <div key={id} className="bound" style={{ left: x0, top: y0, width: x1 - x0, height: y1 - y0, "--c": colorOf(byId[id]) } as React.CSSProperties} />;
            })}
            <svg className="edges">
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                  <path d="M0 0L10 5L0 10z" style={{ fill: "var(--muted)", stroke: "none" }} />
                </marker>
              </defs>
              {boxes.filter((b) => b.parent && b.flow !== "brace" && shown(b.id)).map((b) => {
                return <path key={b.id} style={{ stroke: colorOf(b) }} d={branchD(b, byId[b.parent!])} />;
              })}
              {braces(boxes.filter((b) => shown(b.id))).map((g) => (
                <path key={`brace-${g.id}`} style={{ stroke: colorOf(byId[g.id]) }} d={g.d} />
              ))}
              {rels.map((r) => {
                const d = relD(byId[r.from], byId[r.to]);
                return (
                  <g key={r.id}>
                    <path className={`rel${relSel === r.id ? " sel" : ""}`} d={d} markerEnd="url(#arr)" />
                    <path className="rel-hit" d={d} onPointerDown={(e) => (e.stopPropagation(), setRelSel(r.id))} />
                  </g>
                );
              })}
              {sums.filter(({ x }) => shown(x.from) && shown(x.to)).map(({ x, g }) => (
                <path key={x.id} className={`sum${sumSel === x.id ? " sel" : ""}`} d={summaryD(g)} />
              ))}
            </svg>
            {boxes.filter((b) => shown(b.id)).map((b) => {
              const n = byNode[b.id];
              return (
                <div
                  key={b.id}
                  className={`node${b.depth === 0 ? " root" : ""}${picked.has(b.id) ? " sel" : ""}${dragging === b.id ? " dragging" : ""}${n.color ? " filled" : ""}${b.side === -1 ? " left" : ""}${b.flow !== "right" ? ` flow-${b.flow}` : ""}${hits.includes(b.id) ? " hit" : ""}${present !== null && b.branch >= 0 && b.branch < present - 1 ? " dim" : ""} shape-${n.shape ?? "round"}`}
                  style={{ left: b.x, top: b.y, width: b.w, height: b.h, "--c": colorOf(b) } as React.CSSProperties}
                  data-id={b.id}
                  draggable={b.depth > 0 && s.edit !== b.id && !n.float}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setRelSel(null);
                    setSumSel(null);
                    if (summarizing) {
                      setSummarizing(false);
                      if (canSummarize(s.root, s.sel, b.id)) commit((r) => addSummary(r, s.sel, b.id));
                      return;
                    }
                    if (linking && b.id !== s.sel) return linkTo(b.id);
                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                      const has = picked.has(b.id);
                      const next = has ? ids.filter((x) => x !== b.id) : [...ids, b.id];
                      setGroup(next);
                      return setS((p) => ({ ...p, sel: has ? (next.at(-1) ?? p.sel) : b.id, edit: null }));
                    }
                    if (!picked.has(b.id)) setGroup([]); // pressing inside a multi-selection keeps it, so the whole group can be dragged
                    setS((p) => ({ ...p, sel: b.id, edit: p.edit === b.id ? p.edit : null }));
                    if (n.float && s.edit !== b.id) startFloatDrag(e, b);
                  }}
                  onClick={(e) => multi && !(e.shiftKey || e.metaKey || e.ctrlKey) && picked.has(b.id) && setGroup([])}
                  onDoubleClick={() => setS((p) => ({ ...p, edit: b.id }))}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", b.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const d = e.dataTransfer.getData("text/plain");
                    commit((r) => moveAll(r, picked.has(d) ? ids : [d], b.id), d);
                  }}
                >
                  {n.icon && <span className="mark">{n.icon}</span>}
                  {n.priority ? (
                    <span className="prio" title={`Priority ${n.priority}`} style={{ background: prioColors(n.priority).bg, color: prioColors(n.priority).fg }}>
                      {n.priority}
                    </span>
                  ) : null}
                  {n.progress != null && (
                    <span className="prog" title={`${n.progress}% done`} style={{ "--p": n.progress } as React.CSSProperties}>
                      {n.progress >= 100 ? "✓" : ""}
                    </span>
                  )}
                  {s.edit === b.id ? (
                    <RichEdit
                      autoFocus
                      text={n.text}
                      runs={n.runs}
                      style={textStyle(n)}
                      onCommit={(text, runs, changed) => (changed ? commit((r) => patch(r, b.id, { text, runs })) : setS((p) => ({ ...p, edit: null })))}
                      onCancel={() => setS((p) => ({ ...p, edit: null }))}
                    />
                  ) : (
                    <span style={textStyle(n)}>
                      {validRuns(n.text, n.runs)?.map((r, k) => <span key={k} style={runStyle(r)}>{r.t}</span>) ?? (n.text || "…")}
                    </span>
                  )}
                  {n.note && <span className="badge" title={n.note}>📝</span>}
                  {n.link && (
                    <span className="badge link" title={`Open ${n.link}`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => (e.stopPropagation(), openLink(n.link!))}>
                      🔗
                    </span>
                  )}
                  {n.children.length > 0 && (
                    <button
                      className="fold"
                      title={n.collapsed ? "Expand" : "Collapse"}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => commit((r) => toggle(r, b.id))}
                    >
                      {n.collapsed ? n.children.length : "‹"}
                    </button>
                  )}
                </div>
              );
            })}
            {sums.filter(({ x }) => shown(x.from) && shown(x.to)).map(({ x, g }) => (
              <div
                key={x.id}
                className={`node sumlabel${sumSel === x.id ? " sel" : ""}`}
                style={{ left: g.label.x, top: g.label.y, width: g.label.w, height: g.label.h }}
                onPointerDown={(e) => (e.stopPropagation(), setSumSel(x.id), setRelSel(null))}
                onDoubleClick={() => setSumEdit(x.id)}
              >
                {sumEdit === x.id ? (
                  <input
                    autoFocus
                    defaultValue={x.text}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => (setSumEdit(null), e.target.value !== x.text && commit((r) => editSummary(r, x.id, e.target.value)))}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setSumEdit(null);
                    }}
                  />
                ) : (
                  <span>{x.text || "…"}</span>
                )}
              </div>
            ))}
          </div>
          {marq && (
            <div
              className="marquee"
              style={{ left: Math.min(marq.x0, marq.x1), top: Math.min(marq.y0, marq.y1), width: Math.abs(marq.x1 - marq.x0), height: Math.abs(marq.y1 - marq.y0) }}
            />
          )}
        </div>
        {panel && (
          <aside className="panel" key={s.sel}>
            <h4>{multi ? `${ids.length} topics` : selNode.text || "Topic"}</h4>
            <label>Fill</label>
            <div className="row">
              {[...theme.palette, "#9fd3cf", "#8a9bb0"].map((c) => (
                <button key={c} className={`sw${selNode.color === c ? " on" : ""}`} style={{ background: c }} onClick={() => setNode({ color: c })} />
              ))}
              <button onClick={() => setNode({ color: undefined })}>Auto</button>
            </div>
            <label>Shape</label>
            <div className="row">
              {SHAPES.map(([id, label]) => (
                <button key={id} className={(selNode.shape ?? "round") === id ? "on" : ""} onClick={() => setNode({ shape: id })}>{label}</button>
              ))}
            </div>
            <label>Marker</label>
            <div className="row">
              {ICONS.map((i) => (
                <button key={i} className={selNode.icon === i ? "on" : ""} onClick={() => setNode({ icon: i })}>{i}</button>
              ))}
              <button onClick={() => setNode({ icon: undefined })}>None</button>
            </div>
            <label title="With the cursor in a topic or in the notes these style the selected words; otherwise the whole topic">Text</label>
            <div className="row" onMouseDown={(e) => e.preventDefault() /* keep the editor's selection */}>
              <button className={selNode.bold ? "on" : ""} title="Bold (⌘B)" onClick={() => fmt("bold", { bold: selNode.bold ? undefined : true })}><b>B</b></button>
              <button className={selNode.italic ? "on" : ""} title="Italic (⌘I)" onClick={() => fmt("italic", { italic: selNode.italic ? undefined : true })}><i>I</i></button>
              <button className={selNode.strike ? "on" : ""} title="Strikethrough" onClick={() => fmt("strikeThrough", { strike: selNode.strike ? undefined : true })}><s>S</s></button>
            </div>
            <div className="row" onMouseDown={(e) => e.preventDefault()}>
              {theme.palette.map((c) => (
                <button key={c} className={`sw${selNode.textColor === c ? " on" : ""}`} style={{ background: c }} title="Text colour" onClick={() => fmt("foreColor", { textColor: c }, c)} />
              ))}
              <button title="Remove the style" onClick={() => fmt("removeFormat", { textColor: undefined })}>Auto</button>
            </div>
            <label>Priority</label>
            <div className="row">
              {PRIORITIES.map((p) => (
                <button key={p} className={selNode.priority === p ? "on" : ""} onClick={() => setNode({ priority: p })}>{p}</button>
              ))}
              <button onClick={() => setNode({ priority: undefined })}>None</button>
            </div>
            <label>Progress</label>
            <div className="row">
              {PROGRESS.map((p) => (
                <button key={p} className={selNode.progress === p ? "on" : ""} onClick={() => setNode({ progress: p })}>{p}%</button>
              ))}
              <button onClick={() => setNode({ progress: undefined })}>None</button>
            </div>
            {!multi && (
              <>
            <label>Link</label>
            <input defaultValue={selNode.link ?? ""} placeholder="https://…" onBlur={(e) => e.target.value !== (selNode.link ?? "") && setNode({ link: e.target.value || undefined })} />
            {selNode.link && <button onClick={() => openLink(selNode.link!)}>Open link ↗</button>}
            <label>Notes</label>
            <RichEdit
              multiline
              className="notes"
              text={selNode.note ?? ""}
              runs={selNode.noteRuns}
              placeholder="Notes for this topic"
              onCommit={(note, noteRuns, changed) => changed && setNode({ note: note || undefined, noteRuns })}
            />
              </>
            )}
          </aside>
        )}
      </div>
      {present !== null && (
        <div className="hud">
          <button onClick={() => setPresent(Math.max(0, present - 1))}>←</button>
          <span>{present + 1} / {steps}</span>
          <button onClick={() => setPresent(Math.min(steps - 1, present + 1))}>→</button>
          <button onClick={stopPresenting}>Exit</button>
        </div>
      )}
    </div>
  );
}
