# Changelog

All notable changes to SRT Studio. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version lives in `package.json` and is propagated to `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json` by `bun run version <major|minor|patch|x.y.z>`.

## [Unreleased]

## [0.3.0] — 2026-07-22

### Added

- **Multi-language subtitles** — every block can carry a translation per
  language, edited inline under the source text and stored with the project
  (SQLite schema v2). The video overlay previews any number of them at once,
  one line per language under the original. Export writes one file per language, translation-only or
  with the original stacked above it, plus a "every language into a folder" pass.
- **Translation** — batch translation through a local model (Ollama, LM Studio,
  any other OpenAI-compatible server) or a cloud one (Anthropic, OpenAI, Gemini,
  or another OpenAI-compatible endpoint), configured in Settings and called from
  Rust. Each request carries the neighbouring subtitle lines as read-only
  context, and progress is reported per batch in the Process log and on the
  toolbar button. Single blocks can be re-translated on their own.
- **Model detection** — picking a provider fills in its endpoint and asks it
  which models it has; the detected list appears as a picker beside the model
  field, and a model the provider does not advertise can still be typed. Local
  servers are detected without a key, cloud ones as soon as the key is entered.
- **Interface language** — the whole UI is translated; English and Thai ship,
  and the first run follows the OS language.
- **Settings tabs** — General, Model & prompt, Translation, Export.
- **Export naming** — a file-name prefix and a `{media}` / `{project}` /
  `{lang}` / `{date}` pattern, previewed live in Settings.
- **Drag and drop** — drop a video, an audio file or an `.srt` anywhere on the
  window to open it.
- **Close workspace** — clear the media, the blocks and the open project without
  restarting the app.
- **Share a project** — Projects › *Export file…* writes the whole project to
  one `.srtproj` file (subtitles, translations, settings, a reference to the
  media) and *Import file…* opens one. No API key is ever written into a bundle
  or a saved project. The media is referenced rather than embedded; on import
  the path is checked and, when it is not on this machine, the log names the
  file to open instead.

- **Resumable translation** — Translate only sends the blocks still missing a
  translation, so pressing it again after a stop or a failure carries on instead
  of paying for the whole file twice; a language that is already complete is
  skipped. A **Stop** button ends a run between requests, keeping everything
  translated so far.
- **About window** — app and bundle version, identifier, Tauri version,
  platform, database schema version and the detected ffmpeg, with a warning when
  the interface and the bundle disagree (a stale build).

### Changed

- **Tighter subtitle blocks** — translation lines grow to their content instead
  of reserving a row each, so a block with several languages stays compact. The
  toolbar and the dialog button rows wrap rather than squashing long labels,
  which is what Thai needed.

### Fixed

- **Saved projects no longer store the translation API key.** Only the Gemini
  key was being excluded; opening someone's project could also overwrite your
  own translation key.

### Fixed

- **Waveform for any container** — peaks are decoded by ffmpeg in Rust
  (`waveform_peaks`) instead of the webview, which could not decode mkv/avi/opus
  and left the pane blank. Files with no audio track, or that ffmpeg cannot read,
  fall back to a flat empty track of the right length so regions and retiming
  still work.

## [0.2.0] — 2026-07-22

### Added

- **Versioning** — one version in `package.json`, mirrored into Cargo/Tauri by
  `bun run version`; shown in the toolbar and Settings. SQLite carries its own
  `user_version` schema number, migrated forward on launch.
- **SQLite persistence** — projects (media path, SRT, per-project settings) and app
  settings stored in `srt-studio.db` in the app data dir. Save / Open / Delete from
  the Projects dialog; settings survive without `localStorage`.
- **Logo** — `public/logo-srt-editor.png` in the toolbar and as the window favicon.
- **Icon set** — `lucide-react` replaces the ad-hoc unicode glyphs.
- **Resizable panes** — drag the sidebar player and the process log to any width;
  widths persist.
- **Show/hide the API key** — eye toggle in Settings.

### Changed

- **Accent colour** is now burnt orange / brown across the UI, waveform and regions.
- **Cut** splits at the exact caret position instead of snapping to a word boundary,
  and no longer needs the caret to sit between words.

### Keyboard

- `⌘/Ctrl+Enter` — cut the block at the caret.
- `Backspace` at the very start of a block — merge into the previous block.
- `Delete` at the very end of a block — merge with the next block.

## [0.1.0] — 2026-07-22

Initial MVP: Gemini transcription pipeline (ffmpeg chunking in Rust), waveform with
draggable regions, editable timecodes with no-overlap ripple, subtitle overlay,
SRT import/export.
