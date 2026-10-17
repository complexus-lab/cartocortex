# Cartocortex

A local, native mind-mapping app (XMind-style). Tauri 2 + React + TypeScript. Files stay on your machine.

## Run

Needs Node 22+ and a Rust toolchain (`rustup`).

```bash
npm install
npm run tauri dev      # native window with hot reload
npm run dev            # browser only (port 1420; file save/open fall back to download/upload)
npm run tauri build    # produces the app bundle
npm test               # unit tests for the tree model and layout
```

## Keys

| Key | Action |
|---|---|
| Tab | New child |
| Enter | New sibling |
| Space / F2 / double-click | Edit text (Enter to commit, Esc to cancel) |
| Arrows | Move selection |
| Delete / Backspace | Delete node |
| ⌘/Ctrl+Z, +Shift | Undo, redo |
| ⌘/Ctrl+S | Save as JSON |
| Drag a node onto another | Re-parent |
| Wheel / drag background | Pan; ⌘/Ctrl+wheel or pinch zooms |

The ‹ chip on a node collapses its branch. The map autosaves to local storage; Save/Open use `.json`, and Export MD writes a Markdown outline.

## Layout

- `src/model.ts` – immutable tree ops, tidy-tree layout, Markdown export
- `src/App.tsx` – canvas, keyboard handling, undo/redo, save/open
- `src-tauri/` – Rust shell with the dialog and fs plugins

## Not yet

Floating topics, multiple sheets, clickable links, rich text, task markers, org-chart/fishbone/tree structures, and legacy XML-only `.xmind` files.

## Added

Fill colour, shape, emoji markers, notes and links (inspector panel); relationship lines and boundaries; Logic and Map (two-sided) structures; five themes with per-branch colours; copy/cut/paste/duplicate (⌘C/X/V/D); find (⌘F, Enter cycles); fit-to-view; `.xmind` open and export (first sheet; text, notes, links, folding and structure only).

Outline view (toolbar "Outline": Enter = sibling, Tab / Shift+Tab = indent / outdent, shares undo with the map) and PNG / PDF export (the PDF is one page holding an image of the map, so its text isn't selectable).

Summaries: select a topic, click "Summary", then click the last topic of the range (it must share a parent). A bracket and an editable label (double-click) appear beside the span; click the label and press Delete to remove it. They are included in PNG/PDF export but not in `.xmind` export.

Presentation: "Present" goes full-screen and reveals one top-level branch per step (→ / Space / Enter next, ← back, Esc exit); earlier branches dim.

Multi-select: Shift / ⌘ / Ctrl-click toggles topics; Shift-drag on empty canvas draws a selection box (⌘/Ctrl-drag adds to the current selection); ⌘A selects all. Delete, drag-to-reparent, and the Fill / Shape / Marker controls act on the whole selection, and Summary wraps selected siblings in one click. Copy / paste / duplicate still work on the primary topic only.
