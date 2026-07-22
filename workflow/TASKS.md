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
- [ ] **T-014** — Persist project (blocks + media path) to a `.srtproj` JSON file
- [ ] **T-015** — Parallel chunk transcription with concurrency limit + retry on 429
- [ ] **T-018** — Thinking-level / temperature controls in Settings, passed through to `generationConfig`

## Pending (continued)
- [ ] **T-022** — Style controls for the subtitle overlay (font size, position, background opacity)
- [ ] **T-023** — Clamp block times to the media duration; today the forward ripple can push past the end
- [ ] **T-026** — `extract_audio_chunks` derives `start_sec` as `i * chunk_secs`; ffmpeg's segment cuts aren't guaranteed exact, so times can drift. Accumulate the probed `duration_sec` of preceding chunks instead (`src-tauri/src/audio.rs`)
- [ ] **T-027** — Extracted WAV chunks are written to a timestamped dir under the system temp dir and never removed — every run leaks the whole audio track. Clean up after generation, or purge old `srt-editor/*` dirs at startup
- [ ] **T-028** — `Toolbar` and `BlockItem` call `useAppStore()` with no selector, so they re-subscribe to the whole store. `currentTime` is set every animation frame during playback, which re-renders every block 60×/s. Select only the fields each component uses
- [ ] **T-029** — `parseSrt` accepts overlapping or out-of-order cues from an imported file; run the parsed list through the same ordering/no-overlap normalisation the editor guarantees

## Done
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
