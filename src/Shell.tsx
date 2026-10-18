import { useRef, useState } from "react";
import App, { KEY } from "./App";
import { baseName, confirmDiscard } from "./files";
import { setUnsaved } from "./recovery";

type Tab = { id: number; path?: string; name: string; dirty: boolean };

/** One App per tab, all kept mounted so each keeps its own undo history; only the active one is shown. */
export default function Shell() {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 0, name: "Untitled", dirty: false }]);
  const [active, setActive] = useState(0);
  const nextId = useRef(1);

  const add = (path?: string) => {
    const id = nextId.current++;
    setTabs((t) => [...t, { id, path, name: path ? baseName(path) : "Untitled", dirty: false }]);
    setActive(id);
  };
  const meta = (id: number, name: string, dirty: boolean) =>
    setTabs((t) => (t.some((x) => x.id === id && (x.name !== name || x.dirty !== dirty)) ? t.map((x) => (x.id === id ? { ...x, name, dirty } : x)) : t));
  const close = async (id: number) => {
    const tab = tabs.find((x) => x.id === id);
    if (tab?.dirty && !(await confirmDiscard())) return;
    if (id === 0) { try { localStorage.removeItem(KEY); } catch { /* best-effort */ } setUnsaved(false); } // the autosave belonged to the first tab
    const i = tabs.findIndex((x) => x.id === id), rest = tabs.filter((x) => x.id !== id);
    if (!rest.length) return add(), setTabs((t) => t.filter((x) => x.id !== id));
    setTabs(rest);
    if (active === id) setActive(rest[Math.min(i, rest.length - 1)].id);
  };

  return (
    <div className="shell">
      <div className="tabbar">
        {tabs.map((t) => (
          <div key={t.id} className={`tab${t.id === active ? " on" : ""}`} onClick={() => setActive(t.id)} title={t.path}>
            <span>{t.dirty ? "• " : ""}{t.name}</span>
            <button aria-label={`Close ${t.name}`} onClick={(e) => (e.stopPropagation(), close(t.id))}>×</button>
          </div>
        ))}
        <button className="newtab" onClick={() => add()} title="New map in a new tab">+</button>
      </div>
      {tabs.map((t) => (
        <div key={t.id} className="tabhost" style={{ display: t.id === active ? "flex" : "none" }}>
          <App active={t.id === active} primary={t.id === 0} openPath={t.path} onMeta={(n, d) => meta(t.id, n, d)} openTab={add} />
        </div>
      ))}
    </div>
  );
}
