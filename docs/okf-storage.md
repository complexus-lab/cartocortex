# OKF storage and centered / graph views — study

Status: **study only — specified, never executed**. This document records what storing Cartocortex maps as OKF bundles would require — and what mindmaps centered on any subject or note and a general graph view on top of that storage would cost — so a future implementation can pick it up. Nothing here is built yet.

[OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf%2FSPEC.md) (Open Knowledge Format, v0.2) is a directory tree of markdown files — *concepts* — each with YAML frontmatter whose only required key is `type`. Links between concepts are plain markdown links and carry no type; hierarchy is the directory structure; consumers must tolerate unknown types, unknown frontmatter keys, missing indexes and broken links. It is designed to be read by people, parsed by agents, and diffed in version control.

## Verdict

Compatible, and a good fit. OKF's graph — concepts, untyped markdown links, directory hierarchy — covers Cartocortex's model with almost no friction:

- **A sheet becomes a directory tree**: one markdown file per topic; a topic's children live in the directory named after it (`projet.md` with `projet/roadmap.md`, `projet/roadmap/q3.md` beside it).
- **Cartocortex's two untyped edges — `topicLink` and root-level `rels` — map onto exactly OKF's untyped markdown links.** Nothing is lost in either direction.
- **Centering and graph views are projections**: they are derived from the bundle when it is opened and never change it, so one OKF directory serves every view — the day-one mindmap, the grown-up knowledge graph, and the meeting's recentered map.

The real cost is operational, not representational: today a Cartocortex map is one file saved as a whole, while an OKF bundle is a directory many hands can edit. That is also the point — the journey below ends with a `git diff` that shows what the meeting changed, and with a bundle colleagues and agents can read without Cartocortex.

## The mapping

| Cartocortex | OKF home | Notes |
|---|---|---|
| topic (`Node`) | one concept file | concept id = file path without `.md`; in bundle mode this path is the topic's identity |
| `text` (first line) | `title` frontmatter | the remaining lines of a multi-line topic open the body |
| `note` | body section, or its own concept | a note others should link to or center on is better lifted to a `type: Note` concept beside its topic, linked from it — then "centered on a note" is just recentring on a concept |
| `link` | body markdown link | or an extra `resource` key when the link is the asset the topic describes |
| `children` | the topic's directory | `a.md` plus `a/` beside it; each sheet is one tree at the top of the bundle |
| `topicLink`, `rels` | markdown links in the body | untyped in both formats (OKF: the kind is conveyed by surrounding prose, not by the link); one link per relationship |
| sheet settings (`layout`, `theme`, `title`) | frontmatter of the sheet's root concept | producer-defined keys; OKF consumers must preserve unknown keys, so the round trip is safe |
| `collapsed`, `priority`, `progress`, colours, `icon`, `shape`, `float` | producer-defined keys | same: written back verbatim, ignored by other consumers |
| trust, lifecycle | `generated`, `verified`, `status`, `stale_after` | a hand-edited topic writes `generated.by: human:<id>`; the trust tiers (unverified / machine-confirmed / human-reviewed) and staleness become badges on topics |
| images, summaries, boundaries, per-word style | `references/` assets / producer keys | loss candidates for a first version, as with every other format |

Writer obligations for conformance (§11): every file that is not `index.md` or `log.md` needs parseable frontmatter with a non-empty `type` (say `type: Mind Map Topic`), and absolute bundle-relative links (`/projet/roadmap.md`) survive file moves best. Reader obligations: tolerate unknown `type` values and unknown keys (preserve them on round-trip), missing `index.md`, broken links (OKF calls them not-yet-written knowledge), a bare `verified` mapping, and the v0.1 `timestamp` / `# Citations` fallbacks.

## What already helps

- **`model.ts` is ready on the data side**: untyped `Rel = { id, from, to }`, `topicLink`, free-standing `float` topics with absolute positions, sixteen layout structures, and a `search` that already covers text *and* notes. Nothing about OKF needs a model change.
- **Relationships are drawn as curves between arbitrary topics by id**, not along branches — so a graph made of floating topics plus `rels` renders on today's canvas.
- **`files.ts` already dispatches per format** (`docBytes` / `parseDocReport`, one branch per extension, atomic `writeSafely` next to the target); an `okf` branch slots in the way FreeMind and MindManager did. Only Cartocortex's own `.json` keeps its path on open — a bundle would be the second resident format.
- **Presentation mode exists and is structure-driven** — every layout box carries a `branch` index that "also drives colours and presentation steps" — and the outline view already renders a tree as a list. Both ends of the journey are in place.
- **The multi-format programme wrote six strict readers and writers with round-trip tests.** OKF conformance wants the same discipline, mirrored: a strict writer, a forgiving reader.

## What blocks or is missing

1. **Identity**: topic ids are UUIDs minted by `mk()`; a bundle's ids are paths. Bundle mode needs a path↔node map, and renames and moves must re-point `topicLink` and `rels` — or fall back to `prune()`, which already drops references to deleted topics. OKF tolerates broken links; Cartocortex can afford to repair them.
2. **Persistence model** (the biggest gap): today the app opens one file, edits in memory, and saves one file; imports never overwrite the original. A live bundle is a directory opened once (`open({ directory: true })` in the dialog plugin), then written per file as topics change — create, delete and rename on edit, debounced, reusing `writeSafely` — with a reload when the directory changed on disk (a colleague's `git pull`). Import/export of a bundle can ship first, exactly like the other six formats, before the live workspace.
3. **No YAML parser**: the repo hand-rolls every parser (strict XML, zip, gzip) and has no runtime parsing dependency; frontmatter needs a small subset parser (flat scalars, lists, nested maps) that keeps unknown keys verbatim.
4. **Multi-line topics versus one-line `title`**, and per-word style (`runs`) that markdown cannot hold: both round-trip through producer keys or are lost, the same trade every format PR already documents.
5. **No graph layout**: every existing layout is a tree layout. A general graph view needs a force-directed (or circular) placement — roughly a hundred and fifty lines — on top of the `float` + `rels` primitives.
6. **Presentation of a graph or derived sheet** needs a defined walk: branches do not exist there. A breadth-first walk from the center topic is the natural fit.

## The three views

- **Centered mindmap (the default)**: open a bundle and a sheet reads as today's mindmap — the directory tree *is* the map tree.
- **Recentring on any subject or note**: a "Center on this topic" command derives a fresh sheet rooted at any concept — a subject, or a note lifted to its own concept: its directory children and the concepts it links to become the branches, breadth-first, cycle-safe, depth-capped. The derived sheet edits normally and writes back into the same files, so recentring changes the *view*, never the shape of the knowledge.
- **General graph view**: every concept as a floating topic, hierarchy and links as `rels`, auto-placed by the force layout, with trust and staleness badges when the bundle carries them. From there, pick any node, recenter, and walk the meeting with the existing presentation mode.

The journey holds end to end: start working on one mindmap over a new bundle; add topics and notes as directories and files; let links accumulate — including links into bundles written by colleagues or agents; open the graph view to see the whole; then center on the topic the meeting is about and present it. Every step edits the same OKF directory, so the bundle stays conformant, diffable and readable by others throughout.

## Suggested implementation path

- **PR 1 — `okf.ts` reader / writer**: frontmatter subset parser (unknown keys preserved verbatim), the bundle ↔ sheets mapping of the table above, `files.ts` branches (open filter + Save as entry), round-trip tests against a small handwritten bundle, and the §11 conformance checklist as a test.
- **PR 2 — derived views**: `centerOn(concept, depth)` — a pure projection over hierarchy plus links, breadth-first and cycle-safe — and the "Center on this topic" command; a derived sheet re-derives on open so recentring never mutates the bundle.
- **PR 3 — graph view**: force-directed placement over `float` + `rels`, trust and staleness badges, and the breadth-first presentation walk for graph and derived sheets.
- **PR 4 — live bundle** (after 1, optional): directory open with the fs scope, debounced per-file writes, delete and rename on topic edits, reload on external change, `index.md` / `log.md` synthesis.

Estimated scope: three focused PRs after the reader/writer; `model.ts` stays untouched, and PR 1 alone already gives OKF-conformant storage through the same flow as the other six formats.

## Points checked in the code (v0.1.2, commit f296080)

- `src/model.ts` (621 lines): `Rel`, `topicLink`, `float`, the sixteen `layout` values, `search` over text and notes, `prune` dropping references to deleted topics, `branch` documented as driving colours and presentation steps.
- `src/files.ts`: per-format `docBytes` / `parseDocReport` dispatch, `writeSafely` writing next to the target then renaming, `keepsPath` true only for `.json`, dialog filters by extension.
- `package.json`: version 0.1.2, no runtime parsing dependency.
- OKF specification: GoogleCloudPlatform/knowledge-catalog, `okf/SPEC.md` — conformance §11, links §6, trust and lifecycle §5, index and log §8–9.
