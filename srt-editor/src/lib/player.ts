/** Singleton handle to the current media element so any component can seek. */
let mediaEl: HTMLMediaElement | null = null;

export function registerMedia(el: HTMLMediaElement | null): void {
  mediaEl = el;
}

export function getMedia(): HTMLMediaElement | null {
  return mediaEl;
}

export function seekTo(seconds: number): void {
  if (mediaEl) mediaEl.currentTime = seconds;
}
