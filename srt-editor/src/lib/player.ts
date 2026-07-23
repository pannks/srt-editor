/** Singleton handle to the current media element so any component can seek. */
let mediaEl: HTMLMediaElement | null = null;
/** Survives media swaps: reapplied by the player when a new element registers. */
let playbackRate = 1;

export function registerMedia(el: HTMLMediaElement | null): void {
  mediaEl = el;
  if (el) el.playbackRate = playbackRate;
}

export function getMedia(): HTMLMediaElement | null {
  return mediaEl;
}

export function seekTo(seconds: number): void {
  if (mediaEl) mediaEl.currentTime = seconds;
}

export function seekBy(delta: number): void {
  if (!mediaEl) return;
  const duration = Number.isFinite(mediaEl.duration) ? mediaEl.duration : Infinity;
  mediaEl.currentTime = Math.min(duration, Math.max(0, mediaEl.currentTime + delta));
}

export function togglePlay(): void {
  if (!mediaEl) return;
  if (mediaEl.paused) void mediaEl.play().catch(() => {});
  else mediaEl.pause();
}

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function setPlaybackRate(rate: number): void {
  playbackRate = rate;
  if (mediaEl) mediaEl.playbackRate = rate;
}

export function getPlaybackRate(): number {
  return playbackRate;
}
