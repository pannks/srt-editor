# TASKS

Rules for all agents:
1. Before starting a task: move it to **In Progress**, add your agent name and today's date
2. After finishing: move it to **Done**, keep the agent name and date
3. If you discover a new task while working: add it to **Pending** with a `T-NNN` ID
4. Only one agent should own a task at a time — don't start a task already **In Progress**

## In Progress

## Pending
- [ ] **T-011** — Bundle ffmpeg as Tauri sidecar binary so users don't need system ffmpeg
- [ ] **T-012** — Undo/redo for block edits
- [ ] **T-015** — Parallel chunk transcription with concurrency limit + retry on 429
- [ ] **T-018** — Thinking-level / temperature controls in Settings, passed through to `generationConfig`

## Pending (continued)
- [ ] **T-022** — Style controls for the subtitle overlay (font size, position, background opacity)
- [ ] **T-023** — Clamp block times to the media duration; today the forward ripple can push past the end
- [ ] **T-026** — `extract_audio_chunks` derives `start_sec` as `i * chunk_secs`; ffmpeg's segment cuts aren't guaranteed exact, so times can drift. Accumulate the probed `duration_sec` of preceding chunks instead (`src-tauri/src/audio.rs`)
- [ ] **T-027** — Extracted WAV chunks are written to a timestamped dir under the system temp dir and never removed — every run leaks the whole audio track. Clean up after generation, or purge old `srt-editor/*` dirs at startup
- [ ] **T-028** — `Toolbar`, `PlayerPane` and `ProjectsDialog` still call `useAppStore()` with no selector, so they re-subscribe to the whole store and re-render on every `currentTime` tick. `BlockItem` was fixed in T-034; do the same for the rest
- [ ] **T-029** — `parseSrt` accepts overlapping or out-of-order cues from an imported file; run the parsed list through the same ordering/no-overlap normalisation the editor guarantees

## Pending (added 2026-07-22, from the translation work)
- [ ] **T-048** — Translation requests run strictly one at a time; add a concurrency limit and a retry on 429/timeouts, sharing whatever T-015 builds for transcription
- [ ] **T-049** — Removing a target language in Settings leaves its lines on the blocks (`stripLanguage` exists but nothing calls it). Offer to drop them
- [ ] **T-050** — Editing a block's source text leaves its translation stale with no visual sign; mark the row instead
- [ ] **T-051** — `attachTranslations` pairs stored translations to cues by position, so a project saved and re-opened after an SRT with a different cue count would misalign. Store a cue count or a hash and refuse to attach on mismatch
- [ ] **T-052** — The translation provider's API key is stored in plain text with the rest of the settings; fold it into T-037's keychain move
- [ ] **T-055** — A `.srtproj` bundle references the media by absolute path; offer to relink it (file picker seeded with the stored file name) when the path does not resolve on import, instead of only logging it
- [ ] **T-056** — Import always creates a new project. Offer to update an existing one when a bundle with the same name is imported again

## Pending (added 2026-07-22)
- [ ] **T-036** — Auto-save the open project to SQLite on a debounce, and mark the toolbar badge dirty between saves
- [ ] **T-037** — Store the API key in the OS keychain rather than SQLite/`localStorage` in plain text
- [ ] **T-038** — Resizable height for the player in the `top` layout (only width is resizable today)

## Done
- [x] **T-047** — Export menu: original, per-language, original+translation stacked, or every language into a folder; file names from a Settings prefix + `{media}/{project}/{lang}/{date}` pattern with a live preview _(claude-code, 2026-07-22)_
- [x] **T-046** — Drag-and-drop a video, audio file or `.srt` onto the window, and a Close button that clears media, blocks and the open project _(claude-code, 2026-07-22)_
- [x] **T-045** — Multi-language subtitles: `SubtitleBlock.translations`, editable rows under each block's source text, an optional second overlay line, and SQLite schema v2 (`projects.translations`) to persist them _(claude-code, 2026-07-22)_
- [x] **T-057** — UI pass: wrapping toolbar and dialog action rows (long Thai labels), compact auto-growing translation rows, consistent focus ring, dark scrollbars _(claude-code, 2026-07-22)_
- [x] **T-058** — About window: app/bundle version, identifier, Tauri, platform, DB schema, ffmpeg, plus a stale-build warning (`app_info` command) _(claude-code, 2026-07-22)_
- [x] **T-059** — Translation resumes: only untranslated blocks are sent, complete languages are skipped, and a Stop button ends a run between requests without losing what landed _(claude-code, 2026-07-22)_
- [x] **T-054** — Shareable project files: `.srtproj` bundle (SRT + translations + settings + media reference), Export/Import in the Projects dialog, `path_exists` to check the media resolves here. Fixes the translation API key being stored in saved projects _(claude-code, 2026-07-22)_
- [x] **T-053** — Provider catalogue (Ollama, LM Studio, other local · Anthropic, OpenAI, Gemini, other cloud) with the Anthropic messages protocol in Rust, and model auto-detection via `list_models` feeding the model field _(claude-code, 2026-07-22)_
- [x] **T-044** — Translation pipeline: local or cloud provider (`translate_chat` in Rust), batched requests carrying ±N blocks of read-only context, per-batch progress in the log and on the toolbar, per-block re-translate _(claude-code, 2026-07-22)_
- [x] **T-043** — Interface localisation with English + Thai dictionaries, typed against the English keys; language picker in Settings, OS language on first run _(claude-code, 2026-07-22)_
- [x] **T-042** — Tabbed Settings: General, Model & prompt, Translation, Export _(claude-code, 2026-07-22)_
- [x] **T-040** — Waveform failed to render for most video containers (webview `decodeAudioData`); peaks now decoded by ffmpeg in Rust, with a flat empty-track fallback when there is no audio _(claude-code, 2026-07-22)_
- [x] **T-030** — Versioning system: `package.json` as the single source, `bun run version` mirrors it into Cargo.toml/tauri.conf.json + CHANGELOG, version shown in toolbar/Settings/log; SQLite `user_version` migrations _(claude-code, 2026-07-22)_
- [x] **T-031** — SQLite persistence (`src-tauri/src/db.rs`, rusqlite bundled): projects (media path + SRT + settings snapshot) and app settings, with a Projects dialog — supersedes T-014 _(claude-code, 2026-07-22)_
- [x] **T-032** — App logo (`public/logo-srt-editor.png`) in the toolbar and as the favicon _(claude-code, 2026-07-22)_
- [x] **T-033** — `lucide-react` icon set replaces the unicode glyphs _(claude-code, 2026-07-22)_
- [x] **T-034** — Cut splits at the exact caret (mid-word included) via `splitBlockAtChar`/`cutBlockAtCaret`; ⌘/Ctrl+Enter cuts, Backspace at the start merges into the previous block, Delete at the end merges the next _(claude-code, 2026-07-22)_
- [x] **T-035** — Resizable pane widths (player column, process log) with a CSS-variable splitter that avoids re-renders while dragging; widths persist _(claude-code, 2026-07-22)_
- [x] **T-039** — Burnt-orange / brown accent across the UI, waveform and regions _(claude-code, 2026-07-22)_
- [x] **T-013** — Waveform regions are draggable and resizable, routed through `setBlockTimes` _(claude-code, 2026-07-22)_
- [x] **T-024** — Drag-to-scrub the block timecode fields (0.02 s per pixel, Shift for fine); wheel nudges while focused _(claude-code, 2026-07-22)_
- [x] **T-025** — Waveform zoom (buttons + modifier-scroll, 4–600 px/s) with horizontal scrolling, and labelled block regions on the waveform _(claude-code, 2026-07-22)_
- [x] **T-019** — Sidebar layout option — player in its own column, suits 9:16 video; toggle persists _(claude-code, 2026-07-22)_
- [x] **T-020** — Subtitle overlay preview on the video, driven per frame so it tracks playback _(claude-code, 2026-07-22)_
- [x] **T-021** — Editable start/end timecodes per block with a no-overlap ripple onto neighbours; "Open SRT" to edit an existing subtitle file _(claude-code, 2026-07-22)_
- [x] **T-016** — Fix "Load failed": move the Gemini call from the webview into Rust (`reqwest`), default model → `gemini-3.1-pro-preview`, drop the `@google/genai` dependency _(claude-code, 2026-07-22)_
- [x] **T-017** — Fix audio-only files rendering no player controls (`<audio>` instead of `<video>`) _(claude-code, 2026-07-22)_
- [x] **T-001** — Scaffold Tauri v2 + React TS app with bun in `srt-editor/` _(claude-code, 2026-07-22)_
- [x] **T-002** — Set up `workflow/` agent coordination layer _(claude-code, 2026-07-22)_
- [x] **T-003** — Rust commands: check_ffmpeg, extract_audio_chunks (ffmpeg segment), read_chunk_base64, save_text_file _(claude-code, 2026-07-22)_
- [x] **T-004** — Pure libs: SRT time/generate/parse, block ops (merge prev/next, split, edit, remove), chunk offset/merge _(claude-code, 2026-07-22)_
- [x] **T-005** — Gemini client (`@google/genai`, JSON response schema) + default prompt/model settings _(claude-code, 2026-07-22)_
- [x] **T-006** — Generation pipeline with per-step process logging + progress _(claude-code, 2026-07-22)_
- [x] **T-007** — UI: Toolbar, PlayerPane (wavesurfer waveform + regions), ProcessPanel, BlockList/BlockItem, SettingsDialog, minimal dark CSS _(claude-code, 2026-07-22)_
- [x] **T-008** — Unit tests (vitest, 24 tests) + `bun run build` + `cargo check` green _(claude-code, 2026-07-22)_
- [x] **T-009** — Verify ffmpeg chunk command against real generated audio (70s → 30/30/10) _(claude-code, 2026-07-22)_
- [x] **T-010** — Launch `bun tauri dev`, confirm app boots _(claude-code, 2026-07-22)_
