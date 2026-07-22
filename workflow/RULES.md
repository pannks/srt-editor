# RULES

Evolving rules for all agents. After finishing work, reflect: "Did I do anything wrong, inefficient, or surprising?" If yes, append a rule here using the exact format below. Read all rules before starting work.

Format:

```markdown
## Rule: [Short name]
**Added by**: agent-name
**Date**: YYYY-MM-DD
**Context**: What situation led to this rule
**Rule**: The actual guideline
```

---

## Rule: Use bun, not npm/yarn
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Project standardized on bun as package manager and script runner.
**Rule**: Run `bun install`, `bun run build`, `bun run test`, `bun run tauri dev` inside `srt-editor/`. Never introduce npm/yarn lockfiles.

## Rule: Pure logic in src/lib, tested
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Keeping SRT/block/merge logic testable without Tauri runtime.
**Rule**: Any parsing, time math, or block manipulation goes in `src/lib/**` as pure functions with vitest coverage. Components and Tauri invoke calls stay thin wrappers.

## Rule: Verify before Done
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Rust and TS sides can drift independently.
**Rule**: Before marking a task Done: `bun run test` and `bun run build` pass in `srt-editor/`, and `cargo check` passes in `srt-editor/src-tauri/`.

## Rule: Big HTTP payloads go through Rust, not the webview
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Calling the Gemini API from the frontend with a few megabytes of inline base64 audio failed in the packaged app with the opaque message `Load failed` — macOS WKWebView refuses the request. The same call succeeded from Node with the identical key, model, and payload.
**Rule**: Any request carrying media-sized payloads goes in a Rust command using `reqwest` (see `src-tauri/src/gemini.rs`). The frontend passes a file path, never the file's bytes. Keep response parsing/sanitizing in TypeScript so it stays unit-testable.

## Rule: Use `<audio>` for audio-only media
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: A `<video controls>` element pointed at a WAV rendered nothing at all in WKWebView — no controls, no error.
**Rule**: In `PlayerPane`, pick the element by media kind: `<audio>` for audio files, `<video>` for video. wavesurfer binds to either via its `media` option.

## Rule: Live API test lives in `src-tauri/tests/gemini_live.rs`
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: The webview-vs-Rust bug was invisible to unit tests; only a real request against real audio exposed it.
**Rule**: After touching the Gemini path, run the ignored live test:
`GEMINI_API_KEY=… SRT_TEST_AUDIO=/path/to.wav cargo test --test gemini_live -- --ignored --nocapture`.
Never commit a key — pass it via the environment.

## Rule: All time changes go through `setBlockTimes`
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Overlapping cues produce broken subtitle files, and the fix has to ripple across neighbours rather than clamp one block.
**Rule**: Never assign `start`/`end` on a block directly. Call `setBlockTimes` (or the store's `setTimes`), which keeps the list ordered, gap-free where it was, and non-overlapping. New UI for retiming — waveform drag, keyboard shortcuts — routes through it too.

## Rule: A focused input's draft must follow programmatic changes
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: `TimeField` keeps a local draft while focused so partial typing isn't reformatted. Arrow-key nudging changed the store but left the draft stale, so blurring committed the old text and silently undid the nudge.
**Rule**: When a controlled-with-draft input changes its own value programmatically, update the draft in the same handler. The `!editing` sync effect only covers changes that arrive while the field is unfocused.

## Rule: Sync wavesurfer regions in place, never rebuild them
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Regions used to be cleared and re-added whenever `blocks` changed. Once regions became draggable that fought the drag in progress, because the ripple changes neighbouring blocks mid-gesture.
**Rule**: `PlayerPane` keeps a `Map<blockId, Region>` and reconciles it — remove departed ids, add new ones, `setOptions` the rest. A `draggingRef` set on `region-update` and cleared on `region-updated` skips the sync while a gesture is live.

## Rule: Tauri v2 APIs only
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Much online example code targets Tauri v1 (different plugin/permission model).
**Rule**: Use Tauri v2 patterns: `@tauri-apps/plugin-dialog`, capability files in `src-tauri/capabilities/`, `invoke` from `@tauri-apps/api/core`, `convertFileSrc` for media URLs. Register new commands in `lib.rs` and add needed permissions to `capabilities/default.json`.
