import { Book, bookJson, parseBook } from "./book";
import { Node } from "./model";
import { exportXmind, importXmindSheets } from "./xmind";

export type Opened = { name: string; path: string | null; bytes: Uint8Array };

const tauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const baseName = (path: string) => path.split(/[\\/]/).pop() || path;
export const extOf = (path: string) => (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? "").toLowerCase();

/** `path` first, without duplicates, capped at `max` entries. */
export const pushRecent = (list: string[], path: string, max = 8) => [path, ...list.filter((p) => p !== path)].slice(0, max);

/** What to write for a document saved at `path`: an XMind file for .xmind, otherwise Cartocortex JSON. */
export const docBytes = (path: string, roots: Node[], cur: number): Uint8Array =>
  extOf(path) === "xmind" ? exportXmind(roots) : new TextEncoder().encode(bookJson(roots, cur, true));

/** The document in a file, by its extension. */
export async function parseDoc(name: string, bytes: Uint8Array): Promise<Book> {
  return extOf(name) === "xmind" ? { roots: await importXmindSheets(bytes), cur: 0 } : parseBook(new TextDecoder().decode(bytes));
}

const RECENT_KEY = "cartocortex.recent";

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* best effort */
  }
}

export async function readPath(path: string): Promise<Opened> {
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return { name: baseName(path), path, bytes: await readFile(path) };
}

export async function writePath(path: string, bytes: Uint8Array) {
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, bytes);
}

/** The system "open" dialog (desktop app) or a file input (browser). */
export async function pickOpen(): Promise<Opened | null> {
  if (tauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ filters: [{ name: "Mind map", extensions: ["json", "xmind"] }] });
    return typeof path === "string" ? readPath(path) : null;
  }
  return new Promise((res) => {
    const i = Object.assign(document.createElement("input"), { type: "file", accept: ".json,.xmind" });
    i.onchange = async () => {
      const f = i.files?.[0];
      res(f ? { name: f.name, path: null, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
    };
    i.click();
  });
}

/** The system "save as" dialog (desktop app only). */
export async function pickSavePath(defaultName: string): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: defaultName,
    filters: [{ name: "Cartocortex map (.json)", extensions: ["json"] }, { name: "XMind (.xmind)", extensions: ["xmind"] }],
  });
}

/** Browser fallback for "save": hands the file to the browser as a download. */
export function download(name: string, bytes: Uint8Array) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([bytes as BlobPart])), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Ask before throwing away unsaved changes. */
export async function confirmDiscard(): Promise<boolean> {
  const msg = "You have unsaved changes. Discard them?";
  if (tauri()) return (await import("@tauri-apps/plugin-dialog")).ask(msg, { title: "Cartocortex", kind: "warning" });
  return window.confirm(msg);
}
