import { Book, bookJson, parseBook } from "./book";
import { fromFreemindBytes, toFreemind } from "./freemind";
import { fromMindmanagerBytes, toMindmanager } from "./mindmanager";
import { Node, toMarkdown } from "./model";
import { fromMarkdown, fromOpml, toOpml } from "./outline-io";
import { fromWisemapping, toWisemapping } from "./wisemapping";
import { exportXmind, importXmindSheets } from "./xmind";

export type Opened = { name: string; path: string | null; bytes: Uint8Array };

const tauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const baseName = (path: string) => path.split(/[\\/]/).pop() || path;
export const extOf = (path: string) => (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? "").toLowerCase();

/** `path` first, without duplicates, capped at `max` entries. */
export const pushRecent = (list: string[], path: string, max = 8) => [path, ...list.filter((p) => p !== path)].slice(0, max);

/** Only Cartocortex's own format keeps its place on disk when opened; every other format is an import (Save asks for a new file). */
export const keepsPath = (name: string) => extOf(name) === "json";

/** What to write for a document saved at `path`, by extension: XMind, OPML, Markdown, FreeMind, MindManager, WiseMapping, otherwise Cartocortex JSON. */
export function docBytes(path: string, roots: Node[], cur: number): Uint8Array {
  const ext = extOf(path), text = (s: string) => new TextEncoder().encode(s);
  if (ext === "xmind") return exportXmind(roots);
  if (ext === "opml") return text(toOpml(roots));
  if (ext === "md" || ext === "markdown") return text(roots.map((r) => toMarkdown(r)).join("\n"));
  if (ext === "mm") return text(toFreemind(roots));
  if (ext === "mmap") return toMindmanager(roots);
  if (ext === "wxml") return text(toWisemapping(roots));
  return text(bookJson(roots, cur, true));
}

/** The document in a file, by its extension. A Markdown or OPML file gives one sheet, named after the file if it has no single top topic; a FreeMind or MindManager map gives one sheet per root topic; a WiseMapping map gives one sheet. */
export async function parseDoc(name: string, bytes: Uint8Array): Promise<Book> {
  const ext = extOf(name), text = () => new TextDecoder().decode(bytes);
  if (ext === "xmind") return { roots: await importXmindSheets(bytes), cur: 0 };
  if (ext === "opml") return { roots: [fromOpml(text())], cur: 0 };
  if (ext === "md" || ext === "markdown" || ext === "txt") return { roots: [fromMarkdown(text(), baseName(name).replace(/\.[^.]*$/, ""))], cur: 0 };
  if (ext === "mm") return { roots: await fromFreemindBytes(bytes), cur: 0 };
  if (ext === "mmap") return { roots: await fromMindmanagerBytes(bytes), cur: 0 };
  if (ext === "wxml") return { roots: fromWisemapping(text()), cur: 0 };
  return parseBook(text());
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
    const path = await open({ filters: [{ name: "Mind map or outline", extensions: ["json", "xmind", "opml", "md", "markdown", "mm", "mmap", "wxml"] }] });
    return typeof path === "string" ? readPath(path) : null;
  }
  return new Promise((res) => {
    const i = Object.assign(document.createElement("input"), { type: "file", accept: ".json,.xmind,.opml,.md,.markdown,.mm,.mmap,.wxml" });
    i.onchange = async () => {
      const f = i.files?.[0];
      res(f ? { name: f.name, path: null, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
    };
    i.click();
  });
}

/** Pick a picture to put on a topic: the system dialog (desktop app) or a file input (browser). */
export async function pickImage(): Promise<Blob | null> {
  if (tauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ filters: [{ name: "Picture", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }] });
    if (typeof path !== "string") return null;
    const ext = extOf(path);
    return new Blob([await (await import("@tauri-apps/plugin-fs")).readFile(path)], { type: ext === "jpg" ? "image/jpeg" : `image/${ext}` });
  }
  return new Promise((res) => {
    const i = Object.assign(document.createElement("input"), { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp" });
    i.onchange = () => res(i.files?.[0] ?? null);
    i.click();
  });
}

/** The system "save as" dialog (desktop app only). */
export async function pickSavePath(defaultName: string): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: defaultName,
    filters: [
      { name: "Cartocortex map (.json)", extensions: ["json"] },
      { name: "XMind (.xmind)", extensions: ["xmind"] },
      { name: "OPML outline (.opml)", extensions: ["opml"] },
      { name: "FreeMind / Freeplane (.mm)", extensions: ["mm"] },
      { name: "MindManager (.mmap)", extensions: ["mmap"] },
      { name: "WiseMapping (.wxml)", extensions: ["wxml"] },
      { name: "Markdown outline (.md)", extensions: ["md"] },
    ],
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
