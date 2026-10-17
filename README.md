# Mindmap

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

Themes, icons and notes, relationship lines, boundaries, `.xmind` import/export, and multi-select.
