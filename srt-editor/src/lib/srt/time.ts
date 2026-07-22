/** Format seconds as SRT timestamp `HH:MM:SS,mmm`. */
export function formatSrtTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const ms = Math.round((total % 1) * 1000);
  const s = Math.floor(total) % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** Parse SRT timestamp `HH:MM:SS,mmm` (also accepts `.` as ms separator) to seconds. */
export function parseSrtTime(text: string): number {
  const m = text.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) throw new Error(`invalid SRT timestamp: "${text}"`);
  const [, h, min, s, ms] = m;
  return (
    Number(h) * 3600 +
    Number(min) * 60 +
    Number(s) +
    Number(ms.padEnd(3, "0")) / 1000
  );
}

/** Compact display form `M:SS.d` for UI labels. */
export function formatShortTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Editable form `M:SS.hh`, or `H:MM:SS.hh` past an hour. */
export function formatTimecode(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = (total % 60).toFixed(2).padStart(5, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * Parse the timecode forms a user may type: `12.5`, `1:05.3`, `0:01:05,300`.
 * Throws on anything else so the caller can keep the previous value.
 */
export function parseFlexibleTime(text: string): number {
  const parts = text.trim().replace(",", ".").split(":");
  if (parts.length > 3) throw new Error(`invalid timecode: "${text}"`);
  let seconds = 0;
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) throw new Error(`invalid timecode: "${text}"`);
    seconds = seconds * 60 + Number(part);
  }
  return seconds;
}
