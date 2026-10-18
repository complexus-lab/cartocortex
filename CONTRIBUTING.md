# Contributing to Cartocortex

Cartocortex is a [Complexus Lab](https://github.com/complexus-lab) project. Changes go through pull requests so that someone else can read them first.

## Set up

```bash
npm install
npm run tauri dev   # the desktop app (needs Rust)
npm run dev         # the same UI in a browser, without the native file dialogs
```

## Before you open a PR

```bash
npx tsc --noEmit
npx vitest run
```

CI runs both, plus a desktop build, on every push.

## Workflow

1. Branch from `main`: `feat/…`, `fix/…` or `docs/…`.
2. Keep a PR to one change. Say what it does and how you checked it.
3. Another person reviews; merge when CI is green.
4. Releases: tag `vX.Y.Z` on `main`. The release workflow builds a draft release; edit the notes, then publish.

## Ground rules

- Never copy code or assets from XMind or other products; only file formats and general features are fair game.
- Map files are untrusted input: colours must be `#rrggbb`, images only embedded PNG/JPEG/GIF/WebP, links only http/https/mailto.
- UI colours follow the Glossolalie palette (teal `#0D9488`, navy `#1E3A5F`, pale tints, no dark fills).
