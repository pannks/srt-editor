#!/usr/bin/env bun
/**
 * Single-source-of-truth version bump.
 *
 *   bun run version            # print the current version everywhere
 *   bun run version patch      # 0.2.0 -> 0.2.1
 *   bun run version minor      # 0.2.1 -> 0.3.0
 *   bun run version major      # 0.3.0 -> 1.0.0
 *   bun run version 1.4.2      # explicit
 *
 * Writes package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json and
 * turns the CHANGELOG's "Unreleased" section into a dated release heading.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const p = (...parts: string[]) => join(root, ...parts);

const PKG = p("package.json");
const CARGO = p("src-tauri", "Cargo.toml");
const TAURI = p("src-tauri", "tauri.conf.json");
const CHANGELOG = p("CHANGELOG.md");

const read = (file: string) => readFileSync(file, "utf8");

function bump(current: string, kind: string): string {
  if (/^\d+\.\d+\.\d+/.test(kind)) return kind;
  const [major, minor, patch] = current.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`unknown bump "${kind}" — use major | minor | patch | x.y.z`);
}

const pkg = JSON.parse(read(PKG)) as { version: string };
const arg = process.argv[2];

if (!arg) {
  const cargoVersion = read(CARGO).match(/^version = "(.+)"$/m)?.[1];
  const tauriVersion = JSON.parse(read(TAURI)).version;
  console.log(`package.json     ${pkg.version}`);
  console.log(`Cargo.toml       ${cargoVersion}`);
  console.log(`tauri.conf.json  ${tauriVersion}`);
  const inSync = pkg.version === cargoVersion && pkg.version === tauriVersion;
  console.log(inSync ? "\nin sync" : "\nOUT OF SYNC — run `bun run version patch`");
  process.exit(inSync ? 0 : 1);
}

const next = bump(pkg.version, arg);

// package.json — rewrite the version line only, so formatting survives.
writeFileSync(PKG, read(PKG).replace(/"version": "[^"]+"/, `"version": "${next}"`));

// Cargo.toml — the [package] version is the first `version = ` line.
writeFileSync(CARGO, read(CARGO).replace(/^version = ".+"$/m, `version = "${next}"`));

writeFileSync(TAURI, read(TAURI).replace(/"version": "[^"]+"/, `"version": "${next}"`));

if (existsSync(CHANGELOG)) {
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(
    CHANGELOG,
    read(CHANGELOG).replace(
      /^## \[Unreleased\]$/m,
      `## [Unreleased]\n\n## [${next}] — ${today}`,
    ),
  );
}

console.log(`${pkg.version} -> ${next} (package.json, Cargo.toml, tauri.conf.json, CHANGELOG.md)`);
