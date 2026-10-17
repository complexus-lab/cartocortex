import { Node } from "./model";

/** A document: one root topic per sheet, and which sheet is open. */
export type Book = { roots: Node[]; cur: number };

const isNode = (x: unknown): x is Node => !!x && typeof (x as Node).id === "string" && Array.isArray((x as Node).children);

/** Parse a saved document: the sheet list, or (older files) a single bare root topic. */
export function parseBook(text: string): Book {
  const j = JSON.parse(text);
  if (isNode(j)) return { roots: [j], cur: 0 };
  if (Array.isArray(j?.sheets) && j.sheets.length && j.sheets.every(isNode)) {
    return { roots: j.sheets, cur: Math.min(Math.max(0, Number(j.active) | 0), j.sheets.length - 1) };
  }
  throw new Error("not a Cartocortex file");
}

export const bookJson = (roots: Node[], cur: number, pretty = false) =>
  JSON.stringify({ cartocortex: 1, active: cur, sheets: roots }, null, pretty ? 2 : undefined);

export const sheetTitle = (root: Node, i: number) => root.title || root.text || `Sheet ${i + 1}`;
