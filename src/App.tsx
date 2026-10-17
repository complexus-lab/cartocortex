import { useEffect, useMemo, useRef, useState } from "react";
import {
  Node, addChild, addSibling, findNode, layout, mk, moveTo, neighbour, parentOf, remove, rename, toMarkdown, toggle,
} from "./model";

type S = { root: Node; past: Node[]; future: Node[]; sel: string; edit: string | null };

const KEY = "mindmap.autosave";
const load = (): Node => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "") as Node;
  } catch {
    return { ...mk("Central topic"), children: [mk("Branch 1"), mk("Branch 2")] };
  }
};

const isTauri = "__TAURI_INTERNALS__" in window;

async function saveFile(name: string, ext: string, content: string) {
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: name, filters: [{ name: ext, extensions: [ext] }] });
    if (path) await writeTextFile(path, content);
  } else {
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([content])),
      download: name,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

async function openFile(): Promise<string | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({ filters: [{ name: "json", extensions: ["json"] }] });
    return typeof path === "string" ? readTextFile(path) : null;
  }
  return new Promise((res) => {
    const i = Object.assign(document.createElement("input"), { type: "file", accept: ".json" });
    i.onchange = () => (i.files?.[0] ? i.files[0].text().then(res) : res(null));
    i.click();
  });
}

export default function App() {
  const [s, setS] = useState<S>(() => {
    const root = load();
    return { root, past: [], future: [], sel: root.id, edit: null };
  });
  const [view, setView] = useState({ x: 80, y: Math.round(window.innerHeight / 2) - 40, k: 1 });
  const stage = useRef<HTMLDivElement>(null);

  const boxes = useMemo(() => layout(s.root), [s.root]);
  const byId = useMemo(() => Object.fromEntries(boxes.map((b) => [b.id, b])), [boxes]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s.root));
    } catch {
      /* storage unavailable: autosave is best-effort */
    }
  }, [s.root]);

  /** Apply an edit to the tree, recording undo history. */
  const commit = (fn: (r: Node) => Node, sel?: string, edit: string | null = null) =>
    setS((p) => {
      const root = fn(p.root);
      return root === p.root ? p : { root, past: [...p.past, p.root], future: [], sel: sel ?? p.sel, edit };
    });

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
  const del = () => {
    const p = parentOf(s.root, s.sel);
    if (p) commit((r) => remove(r, s.sel), p.id);
  };
  const open = async () => {
    const text = await openFile();
    if (!text) return;
    try {
      const root = JSON.parse(text) as Node;
      if (typeof root.id !== "string" || !Array.isArray(root.children)) throw new Error("not a mindmap file");
      setS({ root, past: [], future: [], sel: root.id, edit: null });
    } catch (e) {
      alert(`Could not open file: ${(e as Error).message}`);
    }
  };

  // Keyboard-first editing (XMind-style).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (s.edit) return; // the input handles its own keys
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key;
      const go = (dir: "left" | "right" | "up" | "down") => setS((p) => ({ ...p, sel: neighbour(p.root, layout(p.root), p.sel, dir) }));
      if (mod && k === "z") return void (e.preventDefault(), e.shiftKey ? redo() : undo());
      if (mod && k === "s") return void (e.preventDefault(), saveFile("mindmap.json", "json", JSON.stringify(s.root, null, 2)));
      if (mod || e.altKey) return;
      const actions: Record<string, () => void> = {
        Tab: newChild,
        Enter: newSibling,
        " ": () => setS((p) => ({ ...p, edit: p.sel })),
        F2: () => setS((p) => ({ ...p, edit: p.sel })),
        Delete: del,
        Backspace: del,
        ArrowLeft: () => go("left"),
        ArrowRight: () => go("right"),
        ArrowUp: () => go("up"),
        ArrowDown: () => go("down"),
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

  const pan = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    const start = { px: e.clientX, py: e.clientY, ...view };
    const move = (m: PointerEvent) => setView((v) => ({ ...v, x: start.x + m.clientX - start.px, y: start.y + m.clientY - start.py }));
    const up = () => (window.removeEventListener("pointermove", move), window.removeEventListener("pointerup", up));
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    setS((p) => ({ ...p, edit: null }));
  };

  return (
    <div className="app">
      <div className="toolbar">
        <button onClick={newChild}>Child <kbd>Tab</kbd></button>
        <button onClick={newSibling}>Sibling <kbd>↵</kbd></button>
        <button onClick={del}>Delete <kbd>⌫</kbd></button>
        <span className="sep" />
        <button onClick={undo} disabled={!s.past.length}>Undo</button>
        <button onClick={redo} disabled={!s.future.length}>Redo</button>
        <span className="sep" />
        <button onClick={open}>Open…</button>
        <button onClick={() => saveFile("mindmap.json", "json", JSON.stringify(s.root, null, 2))}>Save…</button>
        <button onClick={() => saveFile("mindmap.md", "md", toMarkdown(s.root))}>Export MD</button>
        <button onClick={() => setView({ x: 80, y: Math.round(window.innerHeight / 2) - 40, k: 1 })}>Reset view</button>
      </div>
      <div className="stage" ref={stage} onPointerDown={pan}>
        <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="edges">
            {boxes.filter((b) => b.parent).map((b) => {
              const p = byId[b.parent!];
              const x0 = p.x + p.w, y0 = p.y + p.h / 2, x1 = b.x, y1 = b.y + b.h / 2, mx = (x0 + x1) / 2;
              return <path key={b.id} d={`M${x0} ${y0} C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`} />;
            })}
          </svg>
          {boxes.map((b) => {
            const n = findNode(s.root, b.id)!;
            return (
              <div
                key={b.id}
                className={`node${b.depth === 0 ? " root" : ""}${s.sel === b.id ? " sel" : ""}`}
                style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                draggable={b.depth > 0 && s.edit !== b.id}
                onPointerDown={(e) => (e.stopPropagation(), setS((p) => ({ ...p, sel: b.id, edit: p.edit === b.id ? p.edit : null })))}
                onDoubleClick={() => setS((p) => ({ ...p, edit: b.id }))}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", b.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => commit((r) => moveTo(r, e.dataTransfer.getData("text/plain"), b.id), e.dataTransfer.getData("text/plain"))}
              >
                {s.edit === b.id ? (
                  <input
                    autoFocus
                    defaultValue={n.text}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => commit((r) => rename(r, b.id, e.target.value))}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setS((p) => ({ ...p, edit: null }));
                    }}
                  />
                ) : (
                  <span>{n.text || "…"}</span>
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
        </div>
      </div>
    </div>
  );
}
