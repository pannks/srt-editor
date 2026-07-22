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

## Rule: Append SQLite migrations, never edit them
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: `db.rs` tracks the schema with `PRAGMA user_version` and applies every `MIGRATIONS` entry past the stored version. Editing a shipped entry changes nothing for anyone who already ran it, so their database silently diverges.
**Rule**: Schema changes go in a **new** `MIGRATIONS` entry. Keep the in-memory tests in `db.rs` passing (`cargo test --lib`) — they prove the migration is idempotent.

## Rule: Bump the version with the script
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: The version lives in three files (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) and drifted apart the moment one was edited by hand.
**Rule**: `bun run version <patch|minor|major|x.y.z>` writes all three and dates the CHANGELOG. Bare `bun run version` prints them and exits non-zero if they disagree — cheap to run before finishing a task.

## Rule: One dictionary is the type, the others are checked against it
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: A second interface language is only useful if it cannot silently fall behind the first.
**Rule**: `src/lib/i18n/en.ts` exports `TKey = keyof typeof en` and `Dict = Record<TKey, string>`; every other locale is declared `: Dict`, so a missing key is a build error. New user-facing text goes in `en.ts` first — never inline a literal string in a component.

## Rule: Interpolate only the placeholders you were given
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: The export-pattern help text has to show literal `{media}` / `{lang}` braces, which a blanket `replace(/\{(\w+)\}/g, …)` ate.
**Rule**: `translate()` substitutes only the keys present in `params`. Anything else stays as typed.

## Rule: Strip credentials by removing the field, never by blanking it
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: A saved project stores a settings snapshot, and a `.srtproj` bundle is handed to other people. Settings are applied by merging the snapshot over the current ones, so a snapshot carrying `apiKey: ""` would erase the reader's own key — and one carrying the real key would leak it.
**Rule**: Everything that leaves the app goes through `stripSecrets` in `src/lib/settings/share.ts`, which deletes `apiKey` and `translation.apiKey`. Add every new credential field to it, and assert in a test that the serialized output does not contain the secret.

## Rule: Renaming a settings field needs a migration
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Settings are JSON in `localStorage` and SQLite, so a snapshot written by any earlier build can turn up at load time. `overlayLanguage` became `overlayLanguages` and the old value would simply have vanished.
**Rule**: Every renamed or reshaped settings field gets a mapping in `src/lib/settings/legacy.ts`, which `mergeSettings` runs before merging. The mapping drops the legacy key so it is not written back. Cover it with a test in `legacy.test.ts`.

## Rule: Deep-merge nested settings when loading a stored snapshot
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: `settings` gained a nested `translation` object. `{...DEFAULT, ...stored}` replaces it wholesale, so a snapshot written before a field existed came back with that field `undefined` rather than its default.
**Rule**: Load settings through `mergeSettings`, which merges the nested objects one level deeper. Add any new nested group to it.

## Rule: The provider catalogue holds the differences, Rust holds the protocols
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Ollama, LM Studio, OpenAI and OpenRouter are four entries in the Settings picker but one HTTP shape. Branching on the user's choice inside Rust would have meant a new match arm per vendor.
**Rule**: `lib/translate/providers.ts` is the only place that knows about a vendor — its endpoint, whether the URL is editable, whether a key is needed, its default model. Rust receives `api` (`openai` | `anthropic` | `gemini`), never the preset id. Adding a vendor that speaks an existing protocol is one entry in that file and no Rust change.

## Rule: No `<datalist>` — WKWebView gives it no way to open
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: The detected translation models were put behind `<input list=…>`. In the packaged app the suggestions were unreachable: WKWebView renders no dropdown arrow and only offers the list mid-typing, so a user who had just detected twenty models could not pick one.
**Rule**: Never rely on `<datalist>` for a choice the user has to be able to make. Pair a free-text `<input>` with a real `<select>` of the known values instead. Same applies to any other input type WebKit renders differently from Chrome — check it in `bun run tauri dev`, not just `bun run dev`.

## Rule: A detected model list is a suggestion, not a constraint
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: `/models` does not list everything a server will serve — Ollama omits models it has not pulled yet, and gateways under-report.
**Rule**: The text field stays authoritative and always typeable; the detected list is a shortcut beside it. Detection failing must leave the field usable. Detect on opening the tab and on changing provider; never on every keystroke of a URL or key.

## Rule: A long run must be resumable, and stoppable
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Translating a 57-block project is dozens of requests over several minutes. Stopping it meant closing the app, and pressing Translate again re-translated every block that had already succeeded.
**Rule**: A multi-request pipeline works out what is *still missing* rather than redoing the lot (`pendingIndices`), and polls a `shouldStop` callback between requests so it can be ended without losing what landed. The flag lives in the store and is read through `getState()` inside the callback — a value captured when the run started would never see the button.

## Rule: A failed batch is logged, not thrown
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: A translation run is dozens of requests; one local model returning prose instead of JSON used to abort the whole run and lose the batches already applied.
**Rule**: Long multi-request pipelines catch per request, log the failure to the Process panel, and carry on. Results are applied to the store as each request lands, never batched up until the end.

## Rule: Cutting a block clears its translations
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Splitting a block left the whole translated line on the first half, where it read as a translation of that half.
**Rule**: `splitBlock` / `splitBlockAtChar` set `translations: undefined` on both halves; merging joins them language by language. Any new edit op must state what it does to `translations`.

## Rule: Translations are paired to cues by position, not by id
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: A project stores subtitles as SRT text and `parseSrt` mints fresh block ids, so ids cannot survive a save/load round trip.
**Rule**: `extractTranslations` / `attachTranslations` work in start-time order — the same order `blocksToSrt` writes cues in. Anything else persisted alongside the SRT must use that order too.

## Rule: Resize by CSS variable, not React state
**Added by**: claude-code
**Date**: 2026-07-22
**Context**: Committing a pane width to the store on every pointer-move re-renders the block list and the waveform mid-drag, which stutters and can fight wavesurfer's region drag.
**Rule**: Continuous gestures write to a custom property on the DOM node (`Splitter` sets `--sidebar-w` / `--process-w` on `.app`) and commit to the store only on release.
