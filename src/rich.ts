import type { CSSProperties } from "react";
import { hex } from "./textstyle";

/**
 * A stretch of text with its own style. Topic and note text stay plain strings everywhere (search, outline,
 * layout, Markdown); `runs` only adds styling over them, and is ignored once it no longer spells the text.
 */
export type Run = { t: string; b?: true; i?: true; s?: true; c?: string };
type Fmt = Omit<Run, "t">;

/** The structural part of a DOM node that `fromDom` reads (real DOM nodes satisfy it). */
export type DomLike = {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomLike>;
  getAttribute?(name: string): string | null;
  style?: { fontWeight?: string; fontStyle?: string; textDecoration?: string; textDecorationLine?: string; color?: string };
};

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escXml = (s: string) => escHtml(s).replace(/"/g, "&quot;");

/** The runs, if they still spell out `text` exactly. */
export const validRuns = (text: string, runs?: Run[]): Run[] | undefined =>
  Array.isArray(runs) && runs.length && runs.every((r) => typeof r?.t === "string") && runs.map((r) => r.t).join("") === text ? runs : undefined;

export const plainOf = (runs: Run[]) => runs.map((r) => r.t).join("");
export const isStyled = (runs: Run[]) => runs.some((r) => r.b || r.i || r.s || r.c);

const same = (a: Fmt, b: Fmt) => !!a.b === !!b.b && !!a.i === !!b.i && !!a.s === !!b.s && a.c === b.c;

/** Merge neighbours with the same style, drop empty runs and trailing newlines. */
export function normalize(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.t) continue;
    const last = out[out.length - 1];
    if (last && same(last, r)) last.t += r.t;
    else out.push({ ...r });
  }
  while (out.length) {
    const last = out[out.length - 1];
    last.t = last.t.replace(/\n+$/, "");
    if (last.t) break;
    out.pop();
  }
  return out;
}

/** "#rrggbb" from "#rgb", "#rrggbb" or "rgb(r, g, b)"; anything else (names, markup) is refused. */
export function colorToHex(s: string | null | undefined): string | undefined {
  const v = s?.trim().toLowerCase();
  if (!v) return undefined;
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(v);
  if (m) return "#" + [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("");
  if (/^#[0-9a-f]{3}$/.test(v)) return "#" + [...v.slice(1)].map((c) => c + c).join("");
  return hex(v);
}

/** HTML for the editor, built from escaped text only (never from stored markup). */
export function toHtml(text: string, runs: Run[] | undefined, multiline: boolean): string {
  return (runs ?? [{ t: text }])
    .map((r) => {
      let h = escHtml(r.t);
      if (multiline) h = h.replace(/\n/g, "<br>");
      if (r.s) h = `<s>${h}</s>`;
      if (r.i) h = `<i>${h}</i>`;
      if (r.b) h = `<b>${h}</b>`;
      const c = hex(r.c);
      return c ? `<font color="${c}">${h}</font>` : h;
    })
    .join("");
}

/**
 * Read styled runs back out of an editor's DOM. Understands the tags and inline styles browsers produce for
 * bold, italic, strikethrough and colour; in multiline mode, line breaks and block boundaries become "\n".
 */
export function fromDom(root: DomLike, multiline: boolean): Run[] {
  const out: Run[] = [];
  const push = (t: string, f: Fmt) => t && out.push({ t, ...f });
  const walk = (n: DomLike, f: Fmt) => {
    if (n.nodeType === 3) {
      const raw = (n.textContent ?? "").replace(/ /g, " ");
      return void push(multiline ? raw : raw.replace(/[\r\n]+/g, " "), f);
    }
    if (n.nodeType !== 1) return;
    const tag = n.nodeName.toUpperCase();
    if (tag === "BR") return void (multiline && push("\n", f));
    const g: Fmt = { ...f };
    if (tag === "B" || tag === "STRONG") g.b = true;
    if (tag === "I" || tag === "EM") g.i = true;
    if (tag === "S" || tag === "STRIKE" || tag === "DEL") g.s = true;
    if (tag === "FONT") g.c = colorToHex(n.getAttribute?.("color")) ?? g.c;
    const st = n.style;
    if (st) {
      if (st.fontWeight === "bold" || Number(st.fontWeight) >= 600) g.b = true;
      if (st.fontStyle === "italic") g.i = true;
      if ((st.textDecoration ?? st.textDecorationLine ?? "").includes("line-through")) g.s = true;
      g.c = colorToHex(st.color) ?? g.c;
    }
    // A block starts on a new line, unless the text so far already ends with one.
    if (multiline && (tag === "DIV" || tag === "P") && out.length && !out[out.length - 1].t.endsWith("\n")) push("\n", f);
    Array.from(n.childNodes).forEach((c) => walk(c, g));
  };
  Array.from(root.childNodes).forEach((c) => walk(c, {}));
  return normalize(out);
}

export const runStyle = (r: Run): CSSProperties => ({
  ...(r.b ? { fontWeight: 700 } : {}),
  ...(r.i ? { fontStyle: "italic" } : {}),
  ...(r.s ? { textDecoration: "line-through" } : {}),
  ...(hex(r.c) ? { color: r.c } : {}),
});

/** <tspan>s for an SVG <text> element. */
export const runsSvg = (runs: Run[]) =>
  runs
    .map(
      (r) =>
        `<tspan${r.b ? ' font-weight="700"' : ""}${r.i ? ' font-style="italic"' : ""}${r.s ? ' text-decoration="line-through"' : ""}${hex(r.c) ? ` fill="${r.c}"` : ""}>${escXml(r.t)}</tspan>`,
    )
    .join("");
