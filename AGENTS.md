# AGENTS.md

Instructions for AI coding agents working in this repository.

## Read first, in this order

1. [`workflow/README.md`](workflow/README.md) — the agent protocol (how to claim and close work).
2. [`workflow/CONTEXT.md`](workflow/CONTEXT.md) — tech stack, architecture, directory map, data flow, design decisions.
3. [`workflow/TASKS.md`](workflow/TASKS.md) — task board. Done / In Progress / Pending.
4. [`workflow/RULES.md`](workflow/RULES.md) — hard-won rules from previous sessions. Read all of them before writing code.
5. [`srt-editor/README.md`](srt-editor/README.md) — user-facing description of the app and its commands.

## Repository layout

```
srt-editor/      the app (Tauri v2 + React 19 + TypeScript, bun)
workflow/        agent coordination layer — context, tasks, rules
testing-file/    local media used for manual testing (git-ignored)
```

All code lives in `srt-editor/`. Run every command from there unless stated otherwise.

## Working agreement

- **Claim before you code.** Move a task from Pending to In Progress in `workflow/TASKS.md` with your agent name and today's date. Never take a task another agent owns.
- **Close when done.** Move it to Done. Add anything you discovered to Pending with the next `T-NNN` id.
- **Reflect.** If something surprised you or you did it wrong first, append a rule to `workflow/RULES.md` in its stated format.

## Commands

```bash
cd srt-editor
bun install
bun run tauri dev      # run the app
bun run test           # vitest, pure logic only
bun run build          # tsc + vite production build
cargo check --manifest-path src-tauri/Cargo.toml
```

## Definition of done

A task is not Done until all three pass:

- `bun run test`
- `bun run build`
- `cargo check` in `srt-editor/src-tauri/`

## Non-negotiables

- **bun only.** Never introduce an npm or yarn lockfile.
- **Never commit an API key.** The Gemini key is entered in the app's Settings and stored in `localStorage` on the user's machine. Pass keys to tests via the environment.
- **Pure logic goes in `src/lib/**` with vitest coverage.** Components and Tauri `invoke` wrappers stay thin.
- **All block time changes route through `setBlockTimes`.** Never assign `start`/`end` directly — it is what keeps cues ordered and non-overlapping.
- **Media-sized HTTP payloads go through Rust (`reqwest`), never the webview.** The frontend passes a file path, never the file's bytes.
- **Tauri v2 APIs only.**
- Do not commit `testing-file/`, `dist/`, `node_modules/`, or `src-tauri/target/`.
