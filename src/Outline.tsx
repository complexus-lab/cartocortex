import { useEffect, useState } from "react";
import { Node, addSibling, flat, indent, mk, outdent, remove, rename, toggle } from "./model";

type Props = {
  root: Node;
  sel: string;
  onSelect: (id: string) => void;
  commit: (fn: (r: Node) => Node, sel?: string) => void;
};

/** Indented, editable list of the visible topics. Enter = sibling, Tab / Shift+Tab = indent / outdent. */
export default function Outline({ root, sel, onSelect, commit }: Props) {
  const [focus, setFocus] = useState<string | null>(null);
  const rows = flat(root);

  // Re-focus after every structural edit, since rows remount when their text changes.
  useEffect(() => {
    if (!focus) return;
    const el = document.querySelector<HTMLInputElement>(`.outline input[data-id="${focus}"]`);
    if (el && document.activeElement !== el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [focus, root]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, n: Node, i: number) => {
    const v = e.currentTarget.value;
    const withText = (fn: (r: Node) => Node) => (r: Node) => fn(rename(r, n.id, v));
    const go = (id?: string) => id && (setFocus(id), onSelect(id));
    if (e.key === "Enter") {
      e.preventDefault();
      const c = mk();
      commit(withText((r) => addSibling(r, n.id, c)), c.id);
      setFocus(c.id);
    } else if (e.key === "Tab") {
      e.preventDefault();
      commit(withText((r) => (e.shiftKey ? outdent(r, n.id) : indent(r, n.id))), n.id);
      setFocus(n.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      go(rows[i - 1]?.n.id);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      go(rows[i + 1]?.n.id);
    } else if (e.key === "Backspace" && v === "" && i > 0 && !n.children.length) {
      e.preventDefault();
      const prev = rows[i - 1].n.id;
      commit((r) => remove(r, n.id), prev);
      setFocus(prev);
    }
  };

  return (
    <div className="outline">
      {rows.map(({ n, d }, i) => (
        <div key={n.id} className={`orow${sel === n.id ? " sel" : ""}`} style={{ paddingLeft: 16 + d * 24 }}>
          <span className="obullet" onClick={() => n.children.length && commit((r) => toggle(r, n.id))}>
            {n.children.length ? (n.collapsed ? "▸" : "▾") : "•"}
          </span>
          <input
            key={`${n.id}|${n.text}`}
            data-id={n.id}
            defaultValue={n.text}
            placeholder="Topic"
            onFocus={() => onSelect(n.id)}
            onBlur={(e) => commit((r) => rename(r, n.id, e.target.value))}
            onKeyDown={(e) => onKey(e, n, i)}
          />
        </div>
      ))}
    </div>
  );
}
