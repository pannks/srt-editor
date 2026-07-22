/**
 * App version, injected by Vite from `package.json` (see `vite.config.ts`).
 * Cargo.toml and tauri.conf.json are kept in step by `scripts/bump-version.ts`.
 */
declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0-dev";

/** Schema version this build of the frontend expects the SQLite database to be at. */
export const EXPECTED_DB_VERSION = 1;
