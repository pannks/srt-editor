# CONTEXT

## Project

- **Name:** SRT Studio (`srt-editor/` app folder)
- **Purpose:** Desktop app to generate + edit SRT subtitles from video/audio using Gemini audio transcription.
- **Phase:** MVP (initial implementation 2026-07-22)

## Tech Stack

- **Runtime/PM:** bun 1.1.x
- **Desktop shell:** Tauri v2 (Rust 1.96)
- **Frontend:** React 19, TypeScript ~5.8, Vite 7
- **Waveform:** wavesurfer.js v7 (+ regions plugin)
- **State:** zustand
- **AI:** Gemini REST `generateContent` called **from Rust** (`reqwest`), not the webview — the inline audio payload is multiple megabytes and macOS WKWebView's `fetch` rejects it with "Load failed". Default model `gemini-3.1-pro-preview` (user-configurable in Settings, along with API key, chunk length, prompt)
- **Audio processing:** system `ffmpeg` invoked from Rust (`std::process::Command`) — extracts mono 16 kHz WAV and splits into chunks
- **Tests:** vitest (pure TS modules only)

## Directory Map (inside `srt-editor/`)

```
src/
  lib/
    srt/        parse.ts, generate.ts, time.ts   — SRT format (pure, tested)
    blocks/     ops.ts, active.ts                — block edit ops: mergePrev/mergeNext/split/setBlockTimes, playhead lookup (pure, tested)
    gemini/     client.ts, prompt.ts             — invokes the Rust transcribe command, sanitizes its JSON (tested)
    audio/      extract.ts                       — invoke Rust commands, offset/merge chunk results (tested)
  state/        store.ts                         — zustand store (media, chunks, blocks, process log, settings)
  components/   PlayerPane (player + waveform + subtitle overlay), ProcessPanel, BlockList, BlockItem, TimeField, Toolbar, SettingsDialog
src-tauri/src/
  lib.rs        Tauri setup + command registration
  audio.rs      check_ffmpeg, extract_audio_chunks (ffmpeg), progress events
  gemini.rs     transcribe_chunk command — reads the WAV, POSTs inline audio + JSON schema, returns raw response text
  files.rs      save_text_file command (SRT export)
```

## Data Flow

1. Open file (Tauri dialog) → path kept for ffmpeg; `convertFileSrc` URL for `<video>/<audio>` player + wavesurfer.
2. `extract_audio_chunks(path, chunkSecs)` (Rust/ffmpeg) → `[{path, startSec, durationSec}]`, progress events appended to Process log.
3. Per chunk: `read_chunk_base64` → Gemini `generateContent` (inline WAV + prompt, JSON response schema `[{start, end, text}]`) → offset times by chunk `startSec`.
4. Merge all segments → subtitle **blocks** in store.
5. Edit blocks: inline text edit, editable start/end timecodes, merge with previous, merge with next, split (cut) at word boundary, delete. Click a block's number to seek. Blocks mirrored as wavesurfer regions, and the block under the playhead is drawn over the video as a subtitle overlay.
6. Export → serialize to SRT → save dialog → Rust writes file. "Open SRT" loads an existing file for editing.

## Retiming rule

`setBlockTimes` is the only path that changes block times — the timecode fields (typing, arrows, wheel, drag-scrub) and waveform region drag/resize all route through it. Editing one block ripples onto neighbours so the list never overlaps: the previous block's end is pulled back, the next block's start is pushed out, cascading until a neighbour already clears. Squeezed blocks keep `MIN_BLOCK_DURATION` (0.05 s), and a block cannot start before `index * MIN_BLOCK_DURATION` so earlier blocks always have room. Times round to whole milliseconds, which is SRT's resolution.

## Layout

`settings.layout` is `top` (player above the blocks) or `side` (player in a 360 px column — the one to use for 9:16 video). Toggled from the toolbar, persisted in `localStorage`. Both layouts render the same DOM; only CSS differs, so switching never reloads the media or the waveform.

## Constraints / Decisions

- Minimal UI, plain CSS (no CSS framework). Dark, single-window, three panes: player+waveform (top), process log (side), block list (main).
- Every long-running step must report detailed progress to the Process panel.
- Pure logic lives in `src/lib/**` with unit tests; components stay thin. Single responsibility per module.
- Prefer established libs over homemade modules.
- ffmpeg is a runtime requirement (checked at startup via Rust command; UI shows clear error if missing).
- API key never persisted in repo; stored in `localStorage` on the user's machine.
