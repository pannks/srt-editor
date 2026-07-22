# SRT Studio

Minimal desktop SRT subtitle editor. Open a video or audio file, see the waveform, transcribe with Gemini (chunked audio), edit subtitle blocks, translate them into any number of languages with a local or cloud model, export `.srt`.

The interface itself is available in English and Thai (Settings › General).

Built with Tauri v2 + React 19 + TypeScript, managed with bun.

## Install

Grab a build from the [releases page](https://github.com/pannks/srt-editor/releases):

| Platform              | File                            |
| --------------------- | ------------------------------- |
| macOS, Apple silicon  | `srt-editor_<version>_aarch64.dmg` |
| macOS, Intel          | `srt-editor_<version>_x64.dmg`  |
| Windows, x64          | `srt-editor_<version>_x64-setup.exe` (or the `.msi`) |

`ffmpeg` and `ffprobe` must be on the system — the app shells out to them to
decode audio (`brew install ffmpeg`, or [ffmpeg.org](https://ffmpeg.org/download.html)
on Windows).

The builds are unsigned, so the OS will not trust them on first launch. On macOS,
open the `.app` once with right-click › *Open* (or clear the quarantine flag with
`xattr -dr com.apple.quarantine /Applications/srt-editor.app`). On Windows,
SmartScreen needs *More info* › *Run anyway*.

## Requirements

For building from source:

- [bun](https://bun.sh)
- Rust toolchain (for Tauri)
- `ffmpeg` + `ffprobe` on the system (`brew install ffmpeg`)
- A Gemini API key (entered in the app's Settings, stored locally)
- For translation, either a local OpenAI-compatible server (Ollama, LM Studio,
  llama.cpp) or a cloud key — configured in Settings › Translation

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

## Versioning

`package.json` holds the one true version; `bun run version` mirrors it into
`src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` and dates the CHANGELOG.

```bash
bun run version          # print all three, non-zero exit if they drift
bun run version patch    # or minor | major | 1.4.2
```

The version shows in the toolbar, in Settings, and in the Process log at launch.
The SQLite file carries its own schema number (`PRAGMA user_version`), migrated
forward on launch by `MIGRATIONS` in `src-tauri/src/db.rs` — append a migration,
never edit a shipped one.

Live check against the real Gemini API (needs network and a key, ignored by default):

```bash
GEMINI_API_KEY=your-key SRT_TEST_AUDIO=/path/to/clip.wav cargo test --manifest-path src-tauri/Cargo.toml --test gemini_live -- --ignored --nocapture
```

## How it works

1. **Open media** — native file dialog, or drop a video, audio file or `.srt` anywhere on the window; the file plays in the app and the waveform is drawn from a peak envelope **decoded by ffmpeg in Rust** (`waveform_peaks`), not by the webview. wavesurfer's own decoder uses the browser's `decodeAudioData`, which rejects most video containers (mkv, avi, opus-in-webm) and leaves the pane blank; ffmpeg reads all of them, and skipping the in-webview decode also makes large files load faster. If there is no audio track at all — or ffmpeg cannot read the file — the pane falls back to a flat, correctly-timed empty track, so regions, retiming and every block edit keep working; the Process log says so.
2. **Generate SRT** — Rust invokes ffmpeg to extract mono 16 kHz WAV and split it into chunks (default 300 s, configurable). Rust then POSTs each chunk to Gemini (default model `gemini-3.1-pro-preview`, configurable) with the transcription prompt and a JSON response schema `[{start, end, text}]`. The request runs in Rust rather than the webview because the inline audio is several megabytes, which macOS WKWebView's `fetch` rejects with "Load failed". Segment times are offset by each chunk's start and merged into subtitle blocks. Every step is logged in the Process panel.
3. **Edit blocks** — inline text editing, merge into the previous block, merge with the next one, cut, delete. Clicking a block's number seeks the player; blocks appear as regions on the waveform; the block under the playhead is highlighted.
   - **Cut** splits at the exact caret position, mid-word included — put the caret where the new block should start and press the scissors or `⌘/Ctrl+Enter`. With no caret it falls back to the middle word.
   - **Backspace** at the very start of a block merges it into the previous one; **Delete** at the very end merges the next one in — the same gesture as joining paragraphs in a text editor.
4. **Retime blocks** — three ways, all with the same no-overlap guarantee:
   - **Scrub** a timecode field: drag it left/right (0.02 s per pixel, Shift for quarter-speed).
   - **Type** into it: click to focus, then `12.5`, `1:05.3` or `0:01:05,300`. Arrows nudge 0.05 s, Shift+arrows 0.5 s, and the wheel nudges while the field is focused.
   - **Drag on the waveform**: each block is a labelled region you can move or resize by its edges.

   Neighbours move automatically so blocks never overlap — the ripple cascades outward and stops at the first block that already clears.
5. **Preview** — the block under the playhead is drawn over the video as a subtitle, with a line for each language ticked in Settings › General under the original (tick as many as you like, or **All**). The toolbar's layout toggle moves the player into a side column, which is the one to use for 9:16 video.
6. **Waveform** — `−` / `+` / `Fit` zoom from the whole clip down to 600 px per second; ⌘/Ctrl/Alt+scroll zooms at the pointer, a plain scroll pans. Blocks appear as shaded regions with their number and text.
7. **Projects** — the toolbar's Projects dialog saves the current work (name, media path, subtitles as SRT, translations, and the settings snapshot minus every API key) to a SQLite database in the app data dir, and re-opens or deletes saved projects. App settings live in the same database.
   - **Share** — *Export file…* writes everything to a single `.srtproj` file you can mail or commit; *Import file…* opens one someone sent you. Keys are never written into it. The media is referenced by path and name rather than embedded, so on another machine the subtitles, timings and translations all arrive and the log tells you which media file to open. An imported project is unsaved until you press Save.
8. **Resize** — drag the divider beside the player column or beside the process log to set their widths; double-click a divider to reset it. Widths persist.
9. **Translate** — pick the target languages in Settings › Translation, then press **Translate**. Blocks are sent in batches (default 12) to the configured model, each batch carrying its neighbouring lines as read-only context so a sentence spread over several cues is translated as one thought. Results land block by block while the run continues, and every batch is logged with its line count and duration. Each block's row has its own re-translate button, and every translated line is editable by hand under the source text.
   - **It resumes.** Only blocks still missing a translation are sent, so pressing Translate after a **Stop**, a crash or a batch of failures carries on from the gap rather than redoing the file. A language that is already complete is skipped.
   - **Provider** — on this machine: **Ollama**, **LM Studio** or any other local OpenAI-compatible server; in the cloud: **Anthropic**, **OpenAI**, **Google Gemini** or another OpenAI-compatible endpoint (OpenRouter and friends). Picking one fills in its endpoint; only the self-hosted entries let you edit the URL.
   - **Model** — press **Detect** and the provider is asked which models it has; the answers appear in a picker beside the model field. Local servers are detected without a key, cloud ones as soon as the key is in. A model the provider does not advertise can still be typed straight into the field. **Test connection** does a one-word round trip before you commit.
10. **Export** — the Export menu writes the original, any single language, the original with a translation stacked under it, or every language at once into a folder. File names come from the prefix and `{media}` / `{project}` / `{lang}` / `{date}` pattern in Settings › Export (default `{media}-{lang}` → `clip-th.srt`); any other dot becomes a dash so `.srt` is the only extension. **Open SRT** loads an existing subtitle file to edit, with or without media.
11. **Close** — clears the media, the blocks and the open project; settings and the process log stay.
12. **About** — the ⓘ button reports the app and bundle versions, the identifier, Tauri, the platform, the database schema version and the ffmpeg it found. Worth a look before filing a bug: it warns when the interface and the bundle disagree, which means the build is stale.

## Code map

See [`../workflow/CONTEXT.md`](../workflow/CONTEXT.md) — agents should start at [`../workflow/README.md`](../workflow/README.md).
