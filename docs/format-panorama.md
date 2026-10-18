# Mind map formats and tools — panorama

Documentation only, dated 2026-10-18. This page records what each mind map format and tool carries: the file container, the map content, the representation forms, and the office integrations. It neither ranks formats nor suggests any implementation priority; it is a reference of established facts.

**Legend**

- ✓ — confirmed: established from a real file written by the tool itself, from the tool's official documentation, or from an open-source reference implementation.
- ✓† — documented or well-established *application* feature; whether it is stored in the file format itself is not publicly verifiable.
- ✗ — absent (from the format, or from the tool's model).
- ? — not publicly verifiable; no guess is made.

All tools are columns; all criteria are rows, grouped in zones. Open pull request numbers refer to this repository as of 2026-10-18.

## Panorama

| Criterion | Cartocortex | XMind | FreeMind / Freeplane | MindManager | WiseMapping | Mindomo | iThoughts | SimpleMind | MindMeister | Coggle | Bubbl.us | Lucidchart | Novamind | iMindMap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Zone — Format and status** | | | | | | | | | | | | | | |
| File / storage | own `.json`; XMind, OPML, Markdown in; PNG, PDF out | `.xmind` (zip, JSON; XMind 8 XML also exists) | `.mm` (XML, plain or gzipped) | `.mmap` (zip, XML `Document.xml`) | `.wxml` (XML) | `.mom` (zip, JSON parts) | `.itmz` (zip, `mapdata.xml`) | `.smmx` (zip, `document/mindmap.xml`) | `.mind` (zip, JSON) | none (cloud service) | cloud service; `.xml` export | cloud service (proprietary) | `.nm5` | `.imx`, `.imm` |
| Format specification | open (in-repo model) | not officially documented; widely reverse-engineered | open XML; de facto interchange standard | not published; known through Freeplane's XSLT and WiseMapping's importer | open (reference implementation is its own source code) | not documented; reversed from files written by Mindomo Desktop 11 | "relatively open" (toketaWare); described by the community and MultiMarkdown's reader/writer | not documented; confirmed from a real saved file and open-source tools | only generically described (zip holding a JSON layout) | n/a | `.xml` not officially documented; listed as importable by Mindomo | proprietary | proprietary, undocumented | proprietary, undocumented |
| Application status | active (this repo, v0.1.1) | active | FreeMind dormant; Freeplane (fork) active | active (Corel) | active, open source | active | abandoned by toketaWare (2024) | active | active (Meister) | active | active | active (Lucid) | discontinued | discontinued; successor Ayoa |
| In Cartocortex | native | read + written (`.xmind` JSON; XMind 8 XML read) | PR #1 (open) | PR #3 (open) | PR #4 (open) | PR #5 (open) | PR #6 (open) | PR #8 (open) | not integrated | not integrated; its `.mm` export opens through the FreeMind reader (PR #1) | not integrated | not integrated | not integrated | not integrated |
| **Zone — Map content** | | | | | | | | | | | | | | |
| Topic hierarchy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Multi-line topic text | ✓ | ? | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ? | ✓ | ? | ✓ | ? | ? |
| Notes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ? | ✓ | ✗ | ? | ✓† | ✓† |
| Web links | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ? | ✓ | ✓ | ✓ | ✓† | ✓† |
| Relations between topics | ✓ | ✓ | ✓ (`arrowlink`) | ✓ | ✓ | ✓ | ? | ✓ | ? | ? | ✗ | ? | ✓† | ✓† |
| Task progress (checkbox / %) | ✓ (0–100) | ✓ | ✓ (0–100% icons) | ✓ (`TaskPercentage`) | ✗ | ? | ✓ | ✓ (`progress`/`checked`) | ? | ✗ | ✗ | ✗ | ? | ? |
| Priorities | ✗ | ✓ | ✓ (`full-N` icons) | ✓ (`Prio1-9`) | ✗ | ✓ (markers) | ✓ | ? | ? | ✗ | ✗ | ✗ | ? | ? |
| Colours / themes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ? | ✓ | ✓ | ✓ | ✓† | ✓† |
| Embedded images | ✓ (raster) | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ (attachments) | ? | ✓ (paths to media) | ✓ | ✓ | ✓ | ✓† | ✓† |
| Free positioning | ✓ (floating topics) | ✓ | ✓ (left/right side) | ✓ (floating topics) | ✓ (x, y) | ? | ✓ (`position`) | ✓ (x, y) | ✓ (layout in JSON) | ✓ | ✓ | ✓ | ? | ? |
| Folding state | ✓ | ✓ | ✓ (`folded`) | ✓ (`Collapsed`) | ✓ (`shrink`) | ✓ (`expanded`) | ? | ? | ? | ? | ? | ✗ | ? | ? |
| Boundaries / callouts | ✗ | ✓ | ✓ (clouds / boundaries) | ✓ | ✗ | ✓ | ? | ✓ (callouts, node-groups) | ? | ✗ | ✗ | ? | ? | ? |
| Summaries | ✓ | ✓ | ✗ | ? | ✗ | ✓ | ✓ (`summary1/2`) | ? | ? | ✗ | ✗ | ✗ | ? | ? |
| Multiple maps per file | ✓ (sheets) | ✓ (sheets) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (several `mindmap` elements) | ? | ✗ | ? | ✓ (pages) | ? | ? |
| **Zone — Representation forms** | | | | | | | | | | | | | | |
| Mind map (logic / two-sided) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (radiant) |
| Org chart (top-down) | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ (organigram) | ✓ | ✓ (vertical layout) | ✗ | ✗ | ✗ | ✓ | ? | ? |
| Tree | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ? | ✗ | ✗ | ✗ | ✗ | ? | ? | ? |
| Fishbone (Ishikawa) | ✓ | ✓ | ✗ | ? | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ? | ? |
| Timeline | ✓ | ✓ | ✗ | ✓ (template) | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ? | ? |
| Matrix (SWOT) | ✓ | ✓ | ✗ | ✓ (template) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ? | ? |
| Brace | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ? | ? | ? |
| Gantt | ✗ | ✗ | ✗ | ✓ (Gantt view) | ✗ | ✓ (Gantt view) | ✗ | ✗ | ✗ | ✗ | ✗ | ? | ? | ? |
| Concept map | ✗ | ? | ✗ | ✓ (floating + relations) | ✗ | ✓ | ? | ✗ | ✗ | ? | ✗ | ✓ | ? | ? |
| Outline view | ✓ | ✓ | ✓ (Freeplane) | ✓ (Outline view) | ✗ | ✓ | ✓† | ? | ✓† | ✗ | ✗ | ✓ (text outline export) | ? | ? |
| Presentation mode | ✓ | ✓ | ? | ✓ (Slides view) | ✗ | ✓ | ? | ? | ✓† | ✓† | ✗ | ? | ✓† | ✓† |
| Templates | ✓ (8 starters) | ✓ | ✓ (Freeplane) | ✓ | ✗ | ✓ | ? | ? | ✓† | ? | ✗ | ✓ | ? | ? |
| **Zone — Office and interchange** | | | | | | | | | | | | | | |
| Excel | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ? | ✗ | ✗ | ✗ | ✗ | ? | ? | ? |
| Word | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ? | ? |
| PowerPoint | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ? | ? |
| MS Project | ✗ | ✓ (XMind 8) | ✗ | ✓ | ✗ | import (`.xml`) | import (XML) | ✗ | ✗ | ✗ | ✗ | ✗ | ? | ? |
| Other interchange | PNG, PDF, OPML, Markdown, own `.json` | OPML, Markdown, TextBundle, PNG, SVG, PDF | images, PDF, HTML; de facto interchange target of many tools | Outlook, SharePoint/Teams, Zapier | image/PDF ? | imports `.mmap`, `.mm`, `.mind`, `.xmind`, `.xml` (Bubbl.us), `.smmx`, `.itmz`, Markdown, OPML | imports MindManager, XMind, FreeMind, iMindMap, OPML, text; exports PDF, PNG | imports `.mm`, `.opml`, `.txt`, `.itmz`; exports basic FreeMind `.mm`, OPML, PNG, PDF | PDF, PNG, JPG, RTF, text outline, Markdown, `.mind`; FreeMind, MindManager, XMind exchange | `.mm`, PDF, PNG, plain text | image, PDF, Word, `.xml` | PDF, PNG, JPEG, SVG, text outline, Visio `.vsdx`, CSV data import | ? | expanded exports in the Ultimate edition only; formats not listed publicly |

## Caveats per column

**Cartocortex** — the native model carries topic text (multi-line), notes, links, cross-topic relations, task progress (0–100), colours/themes, embedded raster images, free floating positions, folding, summaries and sheets; it has no priority concept and no boundary or callout concept. The repo's publicly stated "not yet" items are: structure direction variants (org chart up, tree from the left), and relations, floating topics and styles from imported XMind 8 XML files; a mobile (iOS/Android) port study also exists (PR #7). Nothing else is stated as planned.

**XMind** — boundaries and summaries are part of XMind 8 and current versions; whether topic titles accept manual line breaks could not be verified. MS Project export was documented for XMind 8 and is not listed in the current export page; the current export list is PNG, SVG, PDF, Excel, Word, OPML, TextBundle, PowerPoint and Markdown.

**FreeMind / Freeplane** — one map per file. Positions are stored as left/right side only; embedded (base64) images are a Freeplane capability, FreeMind links image files; boundaries appear as FreeMind clouds and Freeplane boundaries. Folding, priorities (`full-N` icons), 0–100% progress icons, colours, arrowlink relations, notes and rich HTML text (`richcontent`) are all confirmed in the format.

**MindManager** — one map per file; the specification is not published: the structure used by the reader is established from Freeplane's `mindmanager2mm.xsl` and WiseMapping's `MindManagerImporter.ts`, plus some MindManager 10 Mac builds that wrote flat XML. Confirmed in the format: plain-text topic text, rich notes, hyperlinks, `Prio1-9` priorities, `TaskPercentage` progress, colours, folding, relationships, floating topics, boundaries, images, growth directions. Whether fishbone exists as a first-class template could not be verified; timeline and SWOT are templates. Documented views: Map, Outline, Linked Maps, Gantt, Slides.

**WiseMapping** — one map per file; the grammar is the project's own serializers (`XMLSerializerTango`, `XMLSerializerPela`). The format has no priorities, no progress, no images, no boundaries and no summaries; it carries text (single- or multi-line), CDATA notes, links, emoji icons, font style, background colour, shapes, `shrink` folding, x/y positions and relationships.

**Mindomo** — one map per file. Task data was not observed in the files studied (`nodes.json` version 42); priorities travel as markers. The reader was established from real files written by Mindomo Desktop 11 (thousands of topics, deleted-topic tombstones, relations, media links). Create options documented by Mindomo: mind map, concept map, organigram, timeline, fishbone, outline, Gantt chart, templates.

**iThoughts** — one map per file. Relations and boundaries could not be verified in the format; folding probably lives in `display_state.plist` (unconfirmed). Summaries are confirmed (`summary1`/`summary2` attributes). Position attributes exist per topic. Abandoned by toketaWare in 2024; the interchange list is theirs.

**SimpleMind** — confirmed from a map saved by SimpleMind itself (flat topic list, `parent="-1"`, `\N` line breaks, BOM + DOCTYPE, task checkboxes with `progress`/`checked`, callouts in `<children>`, boundaries in `node-groups`, `x`/`y` positions, layout modes, several `mindmap` elements per file). Priorities, folding, images and summaries were not observed and are not publicly documented. Exports: FreeMind `.mm` and OPML described by SimpleMind as "basic — text, notes and hierarchy"; imports `.mm`, `.opml`, `.txt`, `.itmz` (Pro).

**MindMeister** — the `.mind` file is publicly described only as a zip holding a JSON file with the map layout and paths to linked images and videos; the rest of the row could not be verified at file level. Documented exports: PDF, image, Word, PowerPoint, document outline, Markdown, and `.mind`, FreeMind, MindManager, XMind exchange; import on paid plans.

**Coggle** — no native file; the row describes the service. Documented: FreeMind `.mm` import and export, experimental `.mmap` import, `.drawio`/mxGraph import, PDF/PNG/text exports. Notes, images, colours and markdown text are service features.

**Bubbl.us** — documented exports: image, PDF, Word; the `.xml` export is not officially documented and was confirmed only through Mindomo's import list ("Bubbl.us file (.xml)"). Bubbl.us itself documents saving to image, PDF and Word; no task, relation or boundary feature was found.

**Lucidchart** — a general diagramming service, not a mind-map-first format; structure forms (org chart, fishbone, timeline, SWOT) come from its shape libraries and templates and are drawn manually. Documented exports: PDF, PNG, JPEG, SVG, "Text Outline", Visio `.vsdx`; data import via CSV. Mind map export to Word/PowerPoint was a user request in the community forum, not a shipped feature.

**Novamind** — discontinued; the `.nm5` format is undocumented. Only broad application-era features are marked (✓†); nothing could be verified at file level.

**iMindMap** — discontinued; the successor Ayoa does not continue the `.imx` format (its help covers importing previously exported files). Only broad application-era features are marked (✓†); nothing could be verified at file level. Expanded export formats existed in the Ultimate edition only, and the exact list is not public.

## How each column was established

- **Cartocortex**: this repository (source code, README, open pull requests).
- **XMind**: current export/import documentation and help pages.
- **FreeMind / Freeplane**: the format as read and written by PR #1 (XML grammar, `richcontent`, icons, arrowlink, gzip), plus Freeplane's MindManager importer (cross-reference).
- **MindManager**: Freeplane's `mindmanager2mm.xsl` and WiseMapping's `MindManagerImporter.ts` (reference importers), the MindManager 2017 User Guide (views), MindManager's Microsoft integrations page, and a third-party export write-up.
- **WiseMapping**: the project's own serializers and importer (`wisemapping-frontend`), read by PR #4.
- **Mindomo**: real `.mom` files written by Mindomo Desktop 11 (public backup repository, thousands of topics), read by PR #5; Mindomo's help pages for creation options, imports and exports.
- **iThoughts**: toketaWare's own statements and FAQ, the community reference gist used on real iCloud files, and MultiMarkdown's `itmz-reader.c`/writers, read by PR #6; toketaWare's compatibility page and the Mind Mapping Software blog's import/export comparison for the interchange list.
- **SimpleMind**: a map saved by SimpleMind itself (the `pahund/simple-mind-search` test fixture, decoded and CRC-checked), the `xmind2smmx` exporter (validated against SimpleMind Pro 2.4.0), the `simplemind-mcp-server` reader/writer, read by PR #8; SimpleMind's support pages for imports and exports.
- **MindMeister**: MindMeister's support pages (export formats, iOS export, import) and the public file-format description of `.mind`.
- **Coggle**: Coggle's knowledge base (import and export articles) and the Coggle blog.
- **Bubbl.us**: Bubbl.us's help topics; Mindomo's import list (for the `.xml` export); a feature walkthrough.
- **Lucidchart**: Lucid's community forum (text outline export), and export/tooling write-ups.
- **Novamind, iMindMap**: public file-format registries, the Ayoa help centre, and the Mind Mapping Software blog's import/export comparison. Little is verifiable; the table marks it.

## Sources

**Specifications and reference implementations**

- Freeplane's MindManager importer: `freeplane/src/editor/resources/xslt/mindmanager2mm.xsl` (Freeplane source tree)
- WiseMapping serializers and importer: `XMLSerializerTango`, `XMLSerializerPela`, `MindManagerImporter.ts` (`wisemapping-frontend` repository)
- Mindomo real files: `aarontmaher/Lauburu-Monorepo`, `01_apps/spatial_grappling/mindomo_backup/`
- iThoughts: toketaWare FAQ and statements; B. Terpstra's iThoughts reference gist; MultiMarkdown 6/7 `itmz-reader.c` and writers
- SimpleMind: `pahund/simple-mind-search` test fixture `src/__tests__/fixtures/simple-mind-search.smmx`; `BartRuSec/xmind2smmx`; `kharabiner/simplemind-mcp-server`

**Official documentation**

- XMind: export guide — https://xmind.com/fr/user-guide/export-new ; export help — https://xmind-help.github.io/en/export.html
- MindManager: 2017 User Guide — https://www.mindmanager.com/static/mm/docs/MindManager_2017_User_Guide_EN.pdf ; Microsoft integrations — https://www.mindmanager.com/en/integrations/microsoft/
- Mindomo: getting started (create options) — https://help.mindomo.com/getting-started/ ; import — https://help.mindomo.com/basics/import-mind-maps/ ; export — https://help.mindomo.com/basics/export-mind-maps/
- SimpleMind: share/export formats — https://simplemind.eu/faq/share-export-in-different-formats/ ; importable files — https://simplemind.eu/faq/what-files-can-simplemind-import/ ; share, export and import group — https://simplemind.eu/faq_group/share-export-and-import/
- MindMeister: export — https://support.mindmeister.com/hc/en-us/articles/360017447280-Export-Your-Mind-Map ; iOS export/print — https://support.mindmeister.com/hc/en-us/articles/115000807204-Export-or-Print-your-Map-on-iOS ; import — https://support.mindmeister.com/hc/en-us/articles/360017498199-Import-Text-Files-and-Mind-Maps-into-MindMeister
- Coggle: import — https://coggle.help/article/34-import-files-into-coggle ; export options — https://coggle.help/article/20-export-options ; supported export formats — https://coggle.help/article/105-supported-export-formats ; blog on `.mm` import — https://bloggle.coggle.it/post/129486892657/import-other-files-to-coggle
- Bubbl.us: help topics (image, PDF, Word saves) — https://bubbl.us/help/topics.htm
- Ayoa (iMindMap successor): importing iMindMap files — https://support.ayoa.com/opening-imindmap-files-in-ayoa

**File-format registries and overviews**

- `.mind` description — https://fileinfo.com/extension/mind
- `.imx` description — https://fileinfo.com/extension/imx
- `.nm5` description — https://www.file-extensions.org/nm5-file-extension
- Mind Mapping Software blog, import/export comparison (iThoughts and iMindMap lists) — https://mindmappingsoftwareblog.com/wp-content/99nc2r/MMS_Import_Export_Comparison.pdf
- Lucidchart text outline export (community) — https://community.lucid.co/ideas/exporting-mind-maps-created-in-lucidchart-to-microsoft-powerpoint-or-word-374
- Lucidchart export overview — https://mindmap.guide/post/7-amazing-enterprise-mindmap-tools-with-powerful-export-options/
- iThoughts compatibility — https://www.toketaware.com/ithoughts-faq-compatibility
- MindManager task export write-up — https://sociamind.com/2015/11/04/exporting-a-simple-task-table-or-to-do-list-from-mindmanager/
- Bubbl.us feature walkthrough — https://edrawmind.wondershare.com/mind-map/bubble-us-mind-map.html

**This repository's research write-ups**: the descriptions of FreeMind, MindManager, WiseMapping, Mindomo, iThoughts and SimpleMind above summarize what the corresponding open pull requests (#1, #3, #4, #5, #6, #8) each had to establish before implementing a reader and writer; those PRs list the per-format findings in detail.
