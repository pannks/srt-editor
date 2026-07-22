# Workflow — Agent Coordination Layer

**Start here.** This folder is the shared coordination layer for all AI agents working on this project.

## What This Project Is

**SRT Studio** — a minimal desktop SRT subtitle editor (Tauri v2 + React + TypeScript, bun) living in `srt-editor/`. It takes a video or audio file, shows the audio waveform, transcribes it with Gemini (chunked audio → timed segments), lets the user edit subtitle blocks (edit text, merge prev/next, split), and exports an `.srt` file.

## Agent Protocol

1. **Read these files first, in order:**
   - [CONTEXT.md](CONTEXT.md) — tech stack, architecture, directory map, constraints
   - [TASKS.md](TASKS.md) — task board; what's done, in progress, pending
   - [RULES.md](RULES.md) — learned rules; follow them, append new ones
2. **Before starting work:** pick a task from TASKS.md **Pending**, move it to **In Progress** with your agent name and today's date. Don't take a task already In Progress.
3. **After finishing work:** move the task to **Done**. Add any newly discovered tasks to **Pending** with the next `T-NNN` id.
4. **Self-improvement:** after finishing, reflect — "Did I do anything wrong, inefficient, or surprising?" If yes, append a rule to RULES.md using its format.

## Ground Rules

- Always update TASKS.md before starting and after finishing work.
- Keep the app buildable: `bun run build` (frontend) and `cargo check` (in `srt-editor/src-tauri`) must pass before marking a task Done.
- Run unit tests: `bun run test` in `srt-editor/`.
- Never commit or hardcode API keys. Gemini key is user-entered in the app Settings, stored locally.
