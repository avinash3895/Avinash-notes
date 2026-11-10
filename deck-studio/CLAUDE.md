# Deck Studio — notes for Claude

Local, offline, single-user PowerPoint-style editor. Python back end + React
editor in Chrome (app window). Export to native `.pptx` is the core requirement.

## Owner's rules (always follow)
- Read the code before changing it; if this file and the code disagree, say so.
- Commit to Git regularly with clear messages.
- **A ribbon feature is only added if it exports faithfully to PowerPoint.**
- Use generic placeholders (X, Y, Z) in code, sample data and comments. Never real company or segment names.
- House style: Interstate font; teal #00778B, #3BAEB7, #75E4E3; amber accent #FFD200.
- The owner has no coding background: explain plainly, show code inline in chat.
- Must run on a locked-down Windows laptop: no admin rights, no internet at run time.
- No AI integration inside the app (parked).

## Layout
```
server/            Python standard-library HTTP server (127.0.0.1:8765)
  app.py           routes; serves web/dist
  export_pptx.py   deck JSON -> .pptx (python-pptx + direct XML)
  chartlib.py      shared chart library (Desktop\Deck Studio Charts)
  deckchart.py     helpers + spec format docs for chart code
  chart_seed/      starter chart files copied into an empty library
  excel.py         reads saved Excel values (openpyxl, data_only)
  platform_win.py  tkinter file dialogs, font list, PowerShell COM (PowerPoint, Outlook)
web/src/           React editor (Vite). web/dist is committed so the laptop needs no Node.
  lib/model.js     deck model + house layouts/master
  lib/text.js      text editing engine (pure functions)
  lib/textHtml.js  text model -> HTML, DOM <-> model positions
  lib/store.js     store, undo/redo (immer), surfaces
  lib/actions.js   editing actions; lib/files.js save/autosave/sync; lib/data.js Excel + charts
  render/          SlideView, ElementView, ChartView (mirrors native chart geometry), TableView
  editor/          Canvas (select/move/resize/rotate/guides), TextEditor
  ui/              ribbon tabs, backstage, dialogs, chart code editor window
tests/             python tests/test_backend.py ; node tests/text.test.mjs
vendor/wheels/     offline Windows wheels (cp311-313) used by Install Deck Studio.bat
```

## Key design decisions
- The deck stores PowerPoint units: EMU for geometry, points for text/lines. The
  editor renders at 96 dpi (1 px = 9525 EMU); export copies values straight across
  and sets every property explicitly (no theme inheritance, `p:style` removed,
  tables use "No Style, No Grid" with explicit fills/borders).
- Text editing never lets the browser edit HTML: `beforeinput` is turned into model
  edits and the paragraph HTML is redrawn. Same HTML for static and editing views.
- Charts: chart code returns a *spec* (see `server/deckchart.py`). ChartView draws
  the spec with PowerPoint's own geometry (gap width, overlap, manual inner plot
  area, fixed axis); the exporter writes each panel as a native chart. Totals are an
  invisible line series with top labels; multi-panel charts export as a group.
- Exported slides are named `ds-<slideId>`; Update PowerPoint matches on that name
  via PowerShell COM (works while the file is open).
- Multi-window: BroadcastChannel `deck-studio` syncs the deck between windows.

## Commands
- Run: `python server/app.py` (or `--no-browser`)
- Build editor: `cd web && npm install && npx vite build` (commit `web/dist`)
- Tests: `python tests/test_backend.py` and `node tests/text.test.mjs`

## Parked
Sync/refresh an exported PowerPoint in place on click; more table styles/borders and
merged cells; multi-user sharing; AI features; picture crop by dragging; slide transitions.
