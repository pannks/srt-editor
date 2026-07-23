import { GOOGLE_FONT_FAMILIES } from "./types";

/**
 * Load the Google Fonts used by the caption picker so the live preview shows
 * them. The export resolves fonts separately (see the Rust exporter), so this
 * is preview-only. A single stylesheet covers every offered family; it is
 * injected once and left in place.
 */
let injected = false;

export function ensureCaptionFonts(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;

  // Preconnect first so the font files start early.
  for (const href of [
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
  ]) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    if (href.endsWith("gstatic.com")) link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }

  const families = GOOGLE_FONT_FAMILIES.map(
    (f) => `family=${encodeURIComponent(f)}:wght@400;700`,
  ).join("&");
  const sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(sheet);
}
