# SRT Studio

Minimal desktop SRT subtitle editor. Open a video or audio file, see the waveform, transcribe with Gemini (chunked audio), edit subtitle blocks, export `.srt`.

Built with Tauri v2 + React 19 + TypeScript, managed with bun.

## Requirements

- [bun](https://bun.sh)
- Rust toolchain (for Tauri)
- `ffmpeg` + `ffprobe` on the system (`brew install ffmpeg`)
- A Gemini API key (entered in the app's Settings, stored locally)

## Run

```bash
bun install
bun run tauri dev
```

## Test / build

```bash
bun run test    # vitest unit tests (pure logic)
bun run build   # tsc + vite production build
bun run tauri build --bundles app  # macOS .app bundle
```

Live check against the real Gemini API (needs network and a key, ignored by default):

```bash
GEMINI_API_KEY=your-key SRT_TEST_AUDIO=/path/to/clip.wav cargo test --manifest-path src-tauri/Cargo.toml --test gemini_live -- --ignored --nocapture
```

## How it works

1. **Open media** — native file dialog; the file plays in the app and wavesurfer renders its waveform.
2. **Generate SRT** — Rust invokes ffmpeg to extract mono 16 kHz WAV and split it into chunks (default 300 s, configurable). Rust then POSTs each chunk to Gemini (default model `gemini-3.1-pro-preview`, configurable) with the transcription prompt and a JSON response schema `[{start, end, text}]`. The request runs in Rust rather than the webview because the inline audio is several megabytes, which macOS WKWebView's `fetch` rejects with "Load failed". Segment times are offset by each chunk's start and merged into subtitle blocks. Every step is logged in the Process panel.
3. **Edit blocks** — inline text editing, merge with previous (⇡), merge with next (⇣), cut at the caret's word (✂), delete (✕). Clicking a block's number seeks the player; blocks appear as regions on the waveform; the block under the playhead is highlighted.
4. **Retime blocks** — three ways, all with the same no-overlap guarantee:
   - **Scrub** a timecode field: drag it left/right (0.02 s per pixel, Shift for quarter-speed).
   - **Type** into it: click to focus, then `12.5`, `1:05.3` or `0:01:05,300`. Arrows nudge 0.05 s, Shift+arrows 0.5 s, and the wheel nudges while the field is focused.
   - **Drag on the waveform**: each block is a labelled region you can move or resize by its edges.

   Neighbours move automatically so blocks never overlap — the ripple cascades outward and stops at the first block that already clears.
5. **Preview** — the block under the playhead is drawn over the video as a subtitle. The toolbar's layout toggle moves the player into a side column, which is the one to use for 9:16 video.
6. **Waveform** — `−` / `+` / `Fit` zoom from the whole clip down to 600 px per second; ⌘/Ctrl/Alt+scroll zooms at the pointer, a plain scroll pans. Blocks appear as shaded regions with their number and text.
7. **Export SRT** — save dialog, standard SubRip output. **Open SRT** loads an existing subtitle file to edit, with or without media.

## Code map

See [`../workflow/CONTEXT.md`](../workflow/CONTEXT.md) — agents should start at [`../workflow/README.md`](../workflow/README.md).
