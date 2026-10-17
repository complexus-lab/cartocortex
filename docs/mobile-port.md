# Porting Cartocortex to mobile (iOS / Android) — study

Status: **study only — specified, never executed**. This document records what a mobile port would require, so a future implementation can pick it up. Nothing here is built yet.

## Verdict

The port is not done in the code as of v0.1.2, and nothing in the README or the open PRs plans it. The architecture is favourable: with Tauri 2 the native shell is nearly free, and the real cost is touch interaction.

## What already helps

- **Tauri 2** officially supports iOS and Android (`tauri ios init` / `tauri android init`). The Rust entry point `src-tauri/src/lib.rs` already carries `#[cfg_attr(mobile, tauri::mobile_entry_point)]` — the standard Tauri 2 mobile-ready template.
- **Plugins** (dialog, fs, opener, persisted-scope) all have mobile counterparts in Tauri 2. The browser fallback behind `isTauri` ("__TAURI_INTERNALS__" in window) shows the file layer is already abstracted away from the desktop: in a browser, Save falls back to a download.
- **Pointer Events** are already used for pan, marquee selection and floating-topic drags — they work with touch, unlike legacy Mouse Events.
- The business logic is pure and tested: `src/model.ts` (immutable tree ops, layout) has no platform dependency; the UI (React + TypeScript + Vite) is isolated in `src/`.

## What blocks or is missing

1. **No mobile target configured**: no `src-tauri/gen/android` or `gen/ios`, no mobile build workflow (`release.yml` builds macOS/Windows/Linux only), and `src-tauri/capabilities/default.json` references the desktop schema.
2. **Keyboard-first UX**: almost all editing relies on Tab / Enter / arrow keys / Cmd (new topic, navigation, undo/redo, find). On mobile these need buttons or a touch toolbar.
3. **HTML5 drag-and-drop** (`draggable`, `dataTransfer`, drop handling for re-parenting) does not work on touch. It must be replaced by a Pointer Events drag, following the existing `startFloatDrag` model in `App.tsx`.
4. **Zoom**: wheel / ctrl+wheel only; no two-finger pinch-zoom. The non-passive wheel listener in `App.tsx` needs a touch counterpart.
5. Smaller items: double-click (unreliable on iOS), hover menus, the fixed side panel layout, the 1100x720 window definition, `localStorage` autosave limits with embedded images (a few-megabyte cap — pictures are stored inside the map).

## Suggested implementation path

- **PR 1 — plumbing**: `tauri ios init` + `tauri android init`, mobile capabilities file, mobile build steps in `release.yml` (draft builds, unsigned), document signing requirements.
- **PR 2 — touch interaction**: reparenting drag in Pointer Events (replacing HTML5 DnD), pinch-zoom with two fingers, long-press instead of double-click, single-tap edit.
- **PR 3 — mobile UI**: a touch toolbar (add child, add sibling, delete, undo/redo, find), collapsible panel, window size / viewport adaptations.
- **PR 4 — storage**: move the autosave from `localStorage` to Tauri's app storage on mobile (size limits with embedded pictures).

Estimated scope: one deep UI PR plus build plumbing — the Rust/TS split means no rewrite.

## Points checked in the code (v0.1.2, commit f296080)

- `package.json`: only @tauri-apps v2 plugins, React 19 — no desktop-only dependency.
- `src-tauri/tauri.conf.json`: window 1100x720, CSP unchanged by mobile; `bundle.targets: "all"`.
- `src-tauri/capabilities/default.json`: desktop schema, window "main", fs permissions scoped to user-picked paths.
- `src/App.tsx` (~995 lines): `isTauri` detection, wheel pan/zoom (non-passive), Pointer Events pan/marquee/float-drag, HTML5 drag for node re-parenting, heavy keyboard handling.
