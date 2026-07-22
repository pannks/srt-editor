# SRT Studio

A minimal desktop subtitle editor. Open a video or audio file, see its waveform, transcribe it with Gemini, edit the subtitle blocks, export an `.srt`.

Built with Tauri v2, React 19 and TypeScript, managed with [bun](https://bun.sh).

## Repository layout

| Path | What it is |
| --- | --- |
| [`srt-editor/`](srt-editor/) | The application. Frontend in `src/`, Rust backend in `src-tauri/`. |
| [`workflow/`](workflow/) | Agent coordination layer — project context, task board, learned rules. |
| [`AGENTS.md`](AGENTS.md) | Start here if you are an AI agent. |
| `testing-file/` | Local media for manual testing. Not committed. |

## Requirements

- [bun](https://bun.sh)
- Rust toolchain (for Tauri)
- `ffmpeg` and `ffprobe` on the system — `brew install ffmpeg`
- A Gemini API key, entered in the app's Settings and stored locally. It is never written to this repository.

## Run

```bash
cd srt-editor
bun install
bun run tauri dev
```

## Test and build

```bash
cd srt-editor
bun run test                        # vitest unit tests (pure logic)
bun run build                       # tsc + vite production build
bun run tauri build --bundles app   # macOS .app bundle
cargo check --manifest-path src-tauri/Cargo.toml
```

## How it works

1. **Open media** — native file dialog; the file plays in the app and wavesurfer renders its waveform.
2. **Generate SRT** — Rust runs ffmpeg to extract a mono 16 kHz WAV and split it into chunks (default 300 s), then POSTs each chunk to Gemini with a JSON response schema of `[{start, end, text}]`. The request runs in Rust rather than the webview because the inline audio is several megabytes, which macOS WKWebView's `fetch` rejects. Segment times are offset by each chunk's start and merged into blocks. Every step is logged in the Process panel.
3. **Edit blocks** — inline text editing, merge with previous, merge with next, cut at a word boundary, delete.
4. **Retime blocks** — scrub or type into the timecode fields, or drag the block's region on the waveform. Neighbours ripple out of the way so cues never overlap.
5. **Preview** — the block under the playhead is drawn over the video. A layout toggle moves the player into a side column, which suits 9:16 video.
6. **Export** — standard SubRip output. "Open SRT" loads an existing subtitle file to edit, with or without media.

For the full feature detail see [`srt-editor/README.md`](srt-editor/README.md); for architecture see [`workflow/CONTEXT.md`](workflow/CONTEXT.md).

## Contributing

Read [`AGENTS.md`](AGENTS.md). A change is done when `bun run test`, `bun run build` and `cargo check` all pass.
