/** Format seconds as WebVTT timestamp `HH:MM:SS.mmm`. */
export function formatVttTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const ms = Math.round((total % 1) * 1000);
  const s = Math.floor(total) % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/**
 * Parse a WebVTT timestamp to seconds. Hours are optional (`MM:SS.mmm` or
 * `HH:MM:SS.mmm`), and a comma is tolerated as the millisecond separator so
 * SRT-flavoured stamps still parse.
 */
export function parseVttTime(text: string): number {
  const m = text.trim().match(/^(?:(\d{1,}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) throw new Error(`invalid WebVTT timestamp: "${text}"`);
  const [, h, min, s, ms] = m;
  return (
    Number(h ?? 0) * 3600 +
    Number(min) * 60 +
    Number(s) +
    Number(ms.padEnd(3, "0")) / 1000
  );
}
