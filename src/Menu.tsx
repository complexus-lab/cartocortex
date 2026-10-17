import { useEffect, useRef, useState } from "react";

export type MenuItem = { label: string; kbd?: string; on?: () => void; disabled?: boolean; checked?: boolean; title?: string } | { heading: string } | "-";

/** A drop-down menu button; closes on pick, outside click or Escape. */
export function Menu({ label, items, title }: { label: string; items: MenuItem[]; title?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("pointerdown", away), document.removeEventListener("keydown", esc));
  }, [open]);
  return (
    <div className="menu" ref={box}>
      <button className={open ? "on" : ""} title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{label} ▾</button>
      {open && (
        <div className="pop" role="menu">
          {items.map((it, i) =>
            it === "-" ? <hr key={i} /> : "heading" in it ? <div key={i} className="heading">{it.heading}</div> : (
              <button key={i} role="menuitem" disabled={it.disabled} title={it.title} className={it.checked ? "chk" : ""} onClick={() => (setOpen(false), it.on?.())}>
                <span className="tick">{it.checked ? "✓" : ""}</span>{it.label}{it.kbd && <kbd>{it.kbd}</kbd>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
