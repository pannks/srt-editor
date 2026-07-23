# Bundling ffmpeg (so users install nothing)

SRT Studio shells out to `ffmpeg`/`ffprobe` for audio extraction, the waveform,
and burning captions. **Caption export additionally needs libass** (the `ass`
filter). Homebrew's default `ffmpeg` no longer ships libass, so relying on the
user's system ffmpeg is fragile.

## What the app does today

`resolve_bin()` in `src-tauri/src/audio.rs` looks for the binary in this order:

1. `$SRT_FFMPEG_DIR` — an override dir (handy for testing a specific build).
2. **Next to the app executable** — where Tauri copies `externalBin` sidecars.
3. Homebrew / system paths (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`).
4. the bare name (PATH), for `bun run tauri dev`.

So the moment a sidecar binary sits next to the app, it wins — no user install.
Until you bundle one, the app falls back to system ffmpeg and, if that lacks
libass, the export fails early with a clear message (`ensure_libass`).

## To bundle for release

1. Get a **static, libass-enabled** ffmpeg + ffprobe for each target you ship
   (see `scripts/fetch-ffmpeg.sh` for trusted sources per platform). Confirm:

   ```bash
   ./ffmpeg -hide_banner -filters | grep ' ass '
   ```

2. Place them under `src-tauri/binaries/`, named with the Rust target triple
   (Tauri strips the triple at bundle time):

   ```
   src-tauri/binaries/ffmpeg-aarch64-apple-darwin
   src-tauri/binaries/ffprobe-aarch64-apple-darwin
   ```

3. Declare them in `src-tauri/tauri.conf.json`:

   ```jsonc
   "bundle": { "externalBin": ["binaries/ffmpeg", "binaries/ffprobe"], … }
   ```

   > Leave this line out until the binaries exist — `tauri build` errors when a
   > declared `externalBin` file is missing.

## Licensing

A libass-enabled ffmpeg pulls in x264/x265 → the binary is **GPL**. Distributing
it makes the app GPL and obliges you to provide the corresponding source (a
written offer / link to the exact build). Prefer builds whose source you can
point at (evermeet, BtbN, John Van Sickle).

## Fonts

Google Fonts chosen in Caption Studio are downloaded per-export into a temp
`fontsdir` and passed to libass, so caption fonts render even when not installed
on the user's machine — nothing extra to bundle for those.
