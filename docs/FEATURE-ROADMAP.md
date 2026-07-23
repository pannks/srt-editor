# Feature roadmap

Where the editor goes next, ordered by value to the target users (translators
and creators subtitling short/educational video). Ships in small, reliable
steps: each feature lands with tests before the next starts.

## Shipped in `feat/icons-findreplace-timing`

| Feature | Notes |
| --- | --- |
| Provider/model brand icons | `@lobehub/icons` in Settings (provider select, model field) and profile rows |
| Find & replace across all cues | ⌘F bar over the block list; case toggle, translations toggle, one-step undo |
| Batch timing offset & stretch | Shift all blocks by ± seconds; stretch by factor for frame-rate drift; one-step undo |

## Next up (recommended order)

1. **Import/export VTT** — WebVTT is what YouTube and browsers want; the SRT
   parser/generator pair in `src/lib/srt/` is the template. ASS export matters
   less for interchange but the Caption Studio already builds ASS internally
   (`src/lib/captions/ass.ts`), so exposing "Export .ass" is cheap.
2. **Relink missing media after importing `.srtproj`** — the import path
   already logs "media not on this machine"; add a "Locate…" button that
   rewrites `mediaPath`. Small, removes a real collaboration papercut.
3. **Subtitle quality checks** — flag cues over N chars/line, reading speed
   over ~20 cps, duration < 0.7 s or > 7 s, overlaps. Pure functions over
   `SubtitleBlock[]`, badge in the block list. High value for the educational
   export targets.
4. **Translation-stale indicator** — hash the source text into each
   translation entry when it is written; show a badge when they diverge, and
   let "Translate" re-run only stale blocks.
5. **Autosave version history** — periodic snapshots of the open project into
   SQLite (schema already local), with a "Restore…" list. Replaces the
   single-slot bulk-edit undo with real history.

## Later

- **Speaker labels and colors** — needs a `speaker` field on `SubtitleBlock`,
  UI in the block row, and colored rendering in overlay + Caption Studio.
- **Export presets (YouTube / TikTok / educational)** — bundles of caption
  layer style + export naming; builds on profiles.
- **Side-by-side source/translation editing** — a second column view of the
  block list; mostly layout work.
- **Waveform silence detection & snap-to-speech** — wavesurfer already decodes
  peaks; detect silence windows and snap block edges when dragging.
- **Spellcheck & terminology glossary** — glossary terms injected into the
  translation prompt; spellcheck via the webview's native checker per language.
- **Custom keyboard shortcuts** — a settings tab mapping action → key; wait
  until the shortcut set stabilises.

## Explicitly deferred

- **Search-and-highlight while typing** (beyond replace) — needs virtualised
  list + match navigation; revisit with the side-by-side view.
- **Full undo stack** — superseded by autosave version history above.
