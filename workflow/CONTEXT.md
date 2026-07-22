# CONTEXT

## Project

- **Name:** SRT Studio (`srt-editor/` app folder)
- **Purpose:** Desktop app to generate + edit SRT subtitles from video/audio using Gemini audio transcription.
- **Phase:** v0.3.0 (2026-07-22) — plus multi-language subtitles, translation providers and interface localisation
- **Version:** `package.json` is the single source; `bun run version <major|minor|patch|x.y.z>` mirrors it into `src-tauri/Cargo.toml` + `src-tauri/tauri.conf.json` and dates `srt-editor/CHANGELOG.md`. Vite injects it as `__APP_VERSION__` (see `src/lib/version.ts`).

## Tech Stack

- **Runtime/PM:** bun 1.1.x
- **Desktop shell:** Tauri v2 (Rust 1.96)
- **Frontend:** React 19, TypeScript ~5.8, Vite 7
- **Waveform:** wavesurfer.js v7 (+ regions plugin)
- **State:** zustand
- **Persistence:** SQLite via `rusqlite` (`bundled`, so no system sqlite) in `src-tauri/src/db.rs` — `srt-studio.db` in the Tauri app data dir. `localStorage` remains only as the synchronous bootstrap cache for settings
- **Icons:** `lucide-react`
- **AI:** Gemini REST `generateContent` called **from Rust** (`reqwest`), not the webview — the inline audio payload is multiple megabytes and macOS WKWebView's `fetch` rejects it with "Load failed". Default model `gemini-3.1-pro-preview` (user-configurable in Settings, along with API key, chunk length, prompt)
- **Translation:** Rust commands `translate_chat` / `list_models` speak three wire protocols — OpenAI-compatible `/chat/completions` (Ollama, LM Studio, OpenAI, OpenRouter, …), Anthropic `/v1/messages`, and Gemini `generateContent`. Also in Rust: a local server is plain HTTP on `localhost`, which the webview will not call from the app's origin
- **i18n:** hand-rolled flat dictionaries in `src/lib/i18n/` (English + Thai); no runtime library
- **Audio processing:** system `ffmpeg` invoked from Rust (`std::process::Command`) — extracts mono 16 kHz WAV and splits into chunks
- **Tests:** vitest (pure TS modules only)

## Directory Map (inside `srt-editor/`)

```
src/
  lib/
    srt/        parse.ts, generate.ts, time.ts, naming.ts  — SRT format + export file names (pure, tested)
    blocks/     ops.ts, active.ts, translations.ts         — block edit ops: mergePrev/mergeNext/split/setBlockTimes,
                                                             playhead lookup, translation extract/attach (pure, tested)
    gemini/     client.ts, prompt.ts             — invokes the Rust transcribe command, sanitizes its JSON (tested)
    translate/  providers.ts, types.ts, batch.ts, client.ts, run.ts
                                                 — provider catalogue + model-list parsing, settings, batching with
                                                   prev/next context, reply parsing (pure, tested); run.ts drives
                                                   the requests
    i18n/       en.ts, th.ts, index.ts, languages.ts       — interface dictionaries + subtitle language catalogue (tested)
    media/      kind.ts                          — extension → video/audio/srt, for dialogs and drag-and-drop (tested)
    audio/      merge.ts, tauri.ts               — invoke Rust commands, offset/merge chunk results (tested)
    db/         projects.ts                      — typed wrappers over the SQLite commands
    version.ts                                   — APP_VERSION, injected from package.json
  state/        store.ts                         — zustand store (media, blocks, process log, settings, open project,
                                                   generate + translate progress)
                openFiles.ts                     — open one path by kind; shared by the dialogs and drag-and-drop
                useT.ts                          — translator bound to `settings.uiLanguage`
  components/   PlayerPane (player + waveform + subtitle overlay), ProcessPanel, BlockList, BlockItem, TimeField,
                Toolbar, ExportMenu, SettingsDialog (tabbed), ProjectsDialog, Splitter
src-tauri/src/
  lib.rs        Tauri setup + command registration
  audio.rs      check_ffmpeg, waveform_peaks (peak envelope), extract_audio_chunks (ffmpeg), progress events
  gemini.rs     transcribe_chunk command — reads the WAV, POSTs inline audio + JSON schema, returns raw response text
  translate.rs  translate_chat command — one chat completion against an OpenAI-compatible server or Gemini (unit-tested)
  files.rs      save_text_file / read_text_file commands (SRT export/import)
  db.rs         SQLite: PRAGMA user_version migrations, project_save/list/load/delete, settings_get/set (unit-tested with an in-memory DB)
```

## Persistence

`db.rs` opens `srt-studio.db` in the app data dir and runs every unapplied entry of
`MIGRATIONS` (one per schema version, tracked by `PRAGMA user_version`). **Append
migrations, never edit a shipped one.** Schema v1:

- `projects(id, name, media_path, media_kind, srt, settings, created_at, updated_at)` —
  subtitles are stored as **SRT text**, not JSON, so a project stays portable; the
  `settings` snapshot deliberately excludes the API key.
- `app_settings(key, value)` — the whole settings object as JSON under one key.

Schema v2 adds `projects.translations`: a JSON array of `{lang: text}`, **one entry
per cue in the SRT's order**. Keeping it beside the SRT rather than inside it means
the stored subtitle file is still a plain single-language SRT. Block ids are
regenerated when the SRT is parsed back, so position — not id — is the join key
(`extractTranslations` / `attachTranslations` in `lib/blocks/translations.ts`).

Settings are read synchronously from `localStorage` for the first paint and then
replaced by the SQLite copy (`hydrateSettings`); every save writes both.

## Data Flow

1. Open file (Tauri dialog) → path kept for ffmpeg; `convertFileSrc` URL for `<video>/<audio>` player + wavesurfer.
2. `extract_audio_chunks(path, chunkSecs)` (Rust/ffmpeg) → `[{path, startSec, durationSec}]`, progress events appended to Process log.
3. Per chunk: `read_chunk_base64` → Gemini `generateContent` (inline WAV + prompt, JSON response schema `[{start, end, text}]`) → offset times by chunk `startSec`.
4. Merge all segments → subtitle **blocks** in store.
5. Edit blocks: inline text edit, editable start/end timecodes, merge with previous, merge with next, split (cut) at word boundary, delete. Click a block's number to seek. Blocks mirrored as wavesurfer regions, and the block under the playhead is drawn over the video as a subtitle overlay.
6. Export → serialize to SRT → save dialog → Rust writes file. "Open SRT" loads an existing file for editing.

## Waveform

`decode_peaks` (`src-tauri/src/audio.rs`) runs `ffmpeg -f f32le` at 2 kHz mono and folds
the stream into one peak per bucket (~40 buckets/second, 1 000–40 000), streaming rather
than buffering the PCM. `PlayerPane` passes the result to wavesurfer as `peaks` +
`duration`, so **wavesurfer never fetches or decodes the media itself** — the webview's
`decodeAudioData` fails on mkv/avi/opus, which is what left the waveform blank.

If ffmpeg reports no audio track (or fails), the pane falls back to a flat envelope with
the media element's duration: regions, retiming and editing keep working, and the Process
log explains why the track is empty. Covered by `src-tauri/tests/waveform.rs`
(`cargo test --test waveform -- --ignored`, needs ffmpeg).

## Retiming rule

`setBlockTimes` is the only path that changes block times — the timecode fields (typing, arrows, wheel, drag-scrub) and waveform region drag/resize all route through it. Editing one block ripples onto neighbours so the list never overlaps: the previous block's end is pulled back, the next block's start is pushed out, cascading until a neighbour already clears. Squeezed blocks keep `MIN_BLOCK_DURATION` (0.05 s), and a block cannot start before `index * MIN_BLOCK_DURATION` so earlier blocks always have room. Times round to whole milliseconds, which is SRT's resolution.

## Layout

`settings.layout` is `top` (player above the blocks) or `side` (player in its own column — the one to use for 9:16 video). Toggled from the toolbar. Both layouts render the same DOM; only CSS differs, so switching never reloads the media or the waveform.

Pane widths are resizable: `Splitter` writes the width straight to the `--sidebar-w` /
`--process-w` custom properties on `.app` while dragging (no React re-render, so the
waveform and the block list stay still) and commits the final value to `settings` on
release. Double-click resets a divider.

## Editing gestures

Cut splits at the **exact caret** (`splitBlockAtChar`), mid-word included, and falls
back to the middle word when the caret sits at an edge or is unknown
(`cutBlockAtCaret`). `⌘/Ctrl+Enter` cuts, `Backspace` at offset 0 merges into the
previous block, `Delete` at the end merges the next one in.

## Project bundles

Saved projects live only in this machine's SQLite file, so sharing one goes
through `lib/project/bundle.ts`: a single `.srtproj` JSON file holding the
subtitles as SRT text, the translations array, the settings snapshot and a
reference to the media. **The media is referenced, not embedded** — the file
stays small and text-diffable, and the recipient opens their own copy.

`parseBundle` validates rather than trusts: a wrong `format`, a `version` newer
than this build, or a missing `srt` is refused with a message naming the
problem. Missing optional fields are filled in instead.

On import, the stored media path is checked with the `path_exists` Rust command
before the player is pointed at it — that path came from someone else's machine
and usually does not resolve here; the Process log then names the file to go and
find. An imported project starts unsaved (`projectId: null`), so **Save** is what
puts it in this machine's database.

**No bundle or saved project ever carries an API key.** `lib/settings/share.ts`
`stripSecrets` removes `apiKey` and `translation.apiKey`, and it *removes* them
rather than blanking them: settings are merged by spreading a snapshot over the
current ones, so an absent field keeps the reader's own key while an empty
string would wipe it. Any new credential field must be added there.

## Translation

`lib/translate/providers.ts` is the catalogue the picker is built from: Ollama,
LM Studio and "other local server" on one side, Anthropic, OpenAI, Gemini and
"other cloud" on the other. Each entry carries its **wire protocol** (`api`),
its endpoint, whether that endpoint is editable, whether a key is required, and
a default model. Only the protocol reaches Rust — `providerApi(id)` — so adding
a provider that speaks an existing protocol is one entry in this file and
nothing else. `migrateProviderId` maps settings written before the catalogue
existed (when `openai` meant "any OpenAI-compatible server") onto the right
entry by looking at the URL it was stored with.

**Model detection**: `list_models` GETs `{base}/models` with whatever auth the
protocol wants and returns the raw body; `parseModelList` reads the three
shapes (`{data:[{id}]}`, Anthropic's `display_name`, Gemini's `models[]` filtered
to those supporting `generateContent`). The result fills a `<select>` **beside**
the model field, not a `<datalist>` on it — WKWebView offers no way to open a
datalist, so the detected models were unreachable in the packaged app. The text
field stays authoritative, because a model the provider does not advertise must
still be typeable. Detection runs on opening the tab and on changing provider,
never per keystroke; the Detect button covers a changed URL or key.

`settings.translation` holds the provider id, base URL, key, model, source
language, target list, batch size and context size. `lib/translate/batch.ts`
turns the block texts into batches: each request carries `batchSize` numbered
lines to translate plus `contextBlocks` neighbouring lines on each side, marked
"do not translate". The model answers with `[{n, text}]`; the parser digs the
array out of fenced or chatty replies and also accepts a bare string array.

`run.ts` loops target × batch, applying each reply to the store as it lands, so
the lines fill in while the run continues, and logging every batch. **A failed
batch is logged and skipped, never fatal** — one bad reply must not lose the
rest of a long run. `translateBlockAt` re-runs a single block with the same
context window.

**Runs resume.** Each language is batched over `pendingIndices` — the blocks
with no translation in it yet — so pressing Translate after a stop, a crash or a
run of failed batches costs only what is left, and a language that is already
complete is skipped with a log line. Context still comes from the full text
list, so a resumed batch reads its already-translated neighbours exactly as the
first pass would have. `retranslateAll` redoes everything. Stop is cooperative:
the toolbar sets `translateStopRequested`, `run.ts` polls it **between**
requests through `shouldStop`, and everything applied so far stays.

`settings.overlayLanguages` is the list previewed under the video, one line per
ticked language in the order ticked; a language the current block has no
translation for is skipped rather than drawn blank.

Stored settings are run through `lib/settings/legacy.ts` on load — it maps
fields that older snapshots wrote (e.g. the single `overlayLanguage` that became
`overlayLanguages`) and drops the legacy key so it is not written back.
**Renaming a settings field without adding a mapping there silently resets it.**

Translations live on the block (`SubtitleBlock.translations`, keyed by ISO code).
Merging two blocks joins their translations language by language; **cutting a
block clears them on both halves**, because half a translation is not a
translation of half the line.

## Interface language

`src/lib/i18n/en.ts` is the source dictionary and `Dict = Record<keyof typeof en, string>`,
so `th.ts` fails to compile if a key is missing. `translate(lang, key, params)`
substitutes only the placeholders passed in, which is what lets help text keep
literal `{media}` braces. Components call `useT()` (`src/state/useT.ts`), which
re-makes the translator only when `settings.uiLanguage` changes. First run
follows the OS language when it is one the app has.

`lib/i18n/languages.ts` is a separate catalogue: the languages *subtitles* can be
translated into, with the English name used in the prompt and the endonym shown
in the UI.

## Export naming

`buildExportName(prefix, pattern, tokens)` resolves `{media}`, `{project}`,
`{lang}` and `{date}`, collapses the separators an empty token leaves behind,
strips reserved characters and appends `.srt`. **Every other dot becomes a
dash** — from the pattern, the prefix, or a media file called `my.video.mp4` —
so `.srt` is the only extension in the name; `clip.th.srt` reads as a second
extension to players and file managers, some of which then take `.th` for the
format. Default pattern is `{media}-{lang}`. Settings previews it live. The
Export menu offers the original, each language on its own, each language stacked
under the original, and a folder pass that writes them all.

## Constraints / Decisions

- Minimal UI, plain CSS (no CSS framework). Warm dark theme, burnt-orange/brown accent (`--accent: #d2782f`); single window, three panes: player+waveform (top), process log (side), block list (main).
- Every long-running step must report detailed progress to the Process panel.
- Pure logic lives in `src/lib/**` with unit tests; components stay thin. Single responsibility per module.
- Prefer established libs over homemade modules.
- ffmpeg is a runtime requirement (checked at startup via Rust command; UI shows clear error if missing).
- API key never persisted in repo; stored on the user's machine (`localStorage` + the local SQLite file) and never written into a saved project. Moving it to the OS keychain is T-037.
