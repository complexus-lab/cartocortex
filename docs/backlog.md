# Cartocortex development backlog

This is a living document. Every item records something the project wants to reach, together with the state of research behind it. Nothing on this page is a commitment, and nothing here is implemented until a pull request says so. New items land on this page first (as intentions or studies); the pull request that implements an item references the entry it delivers.

Statuses: **Proposed** (described here, not yet studied in the code), **Studied** (research exists, no code), **In progress** (a pull request is open), **Done** (merged, the entry names the pull request). Entries are dated.

---

## 1. CRDT-backed document model

**Status:** Proposed · **Added:** 2026-10-29 · **Requested by:** Martin-PB

Adopt a CRDT (Conflict-free Replicated Data Type) as the backing document model, so that real-time co-editing and asynchronous editing (several devices, going offline, merging later) can be layered on later without rewrites.

**Why CRDTs.** A CRDT is a data structure that can be replicated across several devices, edited concurrently and independently, and merged deterministically into the same result on every replica without a central coordinator. That is what makes offline-first and peer-to-peer sync possible: replicas never have to agree on an order first. Operational Transformation, the older approach behind centralized editors, needs a server to order operations; CRDTs do not.

**Library candidates (research, 2026-10):**

- **Yjs** — the de facto standard for collaborative editors, with a mature ecosystem; **Yrs** is its Rust port.
- **Automerge 3** — compact column-oriented storage, much smaller documents than earlier versions.
- **Loro** — a Rust-based newcomer whose **movable trees** are the closest structural match for a mind map (a tree of topics that can be re-parented).

The standing advice from the field: use a library, never hand-roll a sequence CRDT.

**Fit with the code.** The tree operations in `model.ts` are pure and immutable, so they map naturally onto a movable-tree CRDT; layout, presentation order and derived views stay projections of the CRDT state. A CRDT also gives every topic a stable unique identity, which the OKF storage study already flagged as a gap (path identity vs stable ids).

**Open questions.** Library choice (benchmark on real sheets); tombstone growth and compaction; the on-disk persistence format for sheets and migration of existing files; undo/redo over a CRDT history; what the six format readers/writers read from and write into.

**Deliberately out of scope for this item** (later entries, once the model is in): transport (relay or peer-to-peer), presence cursors, access control, end-to-end encryption.

## 2. WebAssembly deployment and the lab showcase site

**Status:** Proposed · **Added:** 2026-10-29 · **Requested by:** Martin-PB

Run Cartocortex entirely in the visitor's browser, embedded in the Complexus Lab showcase site. The page ships the software to the browser and nothing else: **no data is ever sent to lab servers**. Visitors work locally with their own data and the lab sees none of it.

**What already helps.** The vite frontend builds to static files and already runs without Tauri (`npm run dev` serves the same UI in a browser); `isTauri` guards every Tauri API call; the content security policy is strict.

**What it needs:**

- Browser file open and save (File System Access API, with a download fallback) replacing the native dialogs.
- Persistence in browser storage — OPFS (Origin Private File System) or IndexedDB instead of `localStorage` and native files while running on the web.
- A zero-network audit of the web build: no telemetry, no server calls, strict CSP headers on the showcase page.
- Embedding in the showcase site (route or iframe).

**The WebAssembly angle.** The model layer is TypeScript and needs no WebAssembly; the browser runs the static build as-is. WASM becomes relevant only to reuse Rust code from `src-tauri` in the browser (compiled to `wasm32-wasi`, with a WASI shim redirecting `std::fs` to OPFS — the approach of browser runtimes for Tauri apps such as R1). Worth it only if the browser build ends up needing Rust-side code.

## 3. Cloud drive synchronization

**Status:** Proposed · **Added:** 2026-10-29 · **Requested by:** Martin-PB

Let users keep their sheets on their own cloud account — any personal drive — instead of local files only.

**Providers named so far:**

- **Amazon S3** and any S3-compatible endpoint.
- **Google** — Google Drive, and Google Cloud Storage (which speaks an S3-compatible protocol).
- **Microsoft** — OneDrive and Azure Blob storage.
- **Hippius** — a decentralized S3-compatible provider (endpoint `s3.hippius.com`, region `decentralized`, AWS Signature V4, path-style addressing, access keys starting with `hip_`, encrypted at rest), so it works with the same S3 client as AWS.

**Shape.** One S3-compatible client covers Amazon S3, Google Cloud Storage's S3 interoperability, Hippius and any other provider speaking the S3 protocol; Google Drive, OneDrive and Azure Blob have their own APIs. Credentials stay client-side (consistent with item 2: the lab runs no server in the loop). This item pairs with item 1: once the model is CRDT-backed, storing snapshots and deltas in a bucket gives asynchronous multi-device sync almost for free.

**Open questions.** Which providers first (the S3-compatible family first is the cheapest path); where credentials live (browser OPFS vs the OS keychain on desktop); the layout in a bucket (one object per sheet, snapshot plus delta log).

---

*More items will be added to this page as they are detailed.*
