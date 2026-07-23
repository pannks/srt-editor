/** Theme plumbing: tokens live in App.css, this file only flips the attribute. */

export type ThemeMode = "light" | "dark" | "system";

export const THEME_EVENT = "srt-theme-changed";

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === "light" || v === "dark" || v === "system";
}

function systemPrefersLight(): boolean {
  return globalThis.matchMedia?.("(prefers-color-scheme: light)").matches ?? false;
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? (systemPrefersLight() ? "light" : "dark") : mode;
}

/**
 * Stamps the resolved theme on <html> and announces it, so canvas consumers
 * (the waveform reads its colors at draw time) can re-read the CSS variables.
 */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = resolveTheme(mode);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Colors for canvases that cannot use `var()` directly (wavesurfer paints on
 * canvas). Read at creation and again on THEME_EVENT.
 */
export function waveColors(): {
  wave: string;
  progress: string;
  cursor: string;
} {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    wave: read("--wave", "#584a3e"),
    progress: read("--wave-progress", "#d2782f"),
    cursor: read("--wave-cursor", "#f0d9c4"),
  };
}
