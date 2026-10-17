import type { CSSProperties } from "react";
import { Node } from "./model";

/** `s` if it is a plain #rrggbb colour, else undefined. Anything else (names, quotes, markup) is refused. */
export const hex = (s: unknown): string | undefined => (typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s) ? s : undefined);

/** CSS for a topic's text style (bold, italic, strikethrough, colour). */
export const textStyle = (n: Node): CSSProperties => ({
  ...(n.bold ? { fontWeight: 700 } : {}),
  ...(n.italic ? { fontStyle: "italic" } : {}),
  ...(n.strike ? { textDecoration: "line-through" } : {}),
  ...(hex(n.textColor) ? { color: n.textColor } : {}),
});
