import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, {
  type Region,
} from "wavesurfer.js/dist/plugins/regions.esm.js";
import { useAppStore } from "../state/store";
import { findActiveBlock } from "../lib/blocks/active";
import { MIN_BLOCK_DURATION } from "../lib/blocks/ops";
import type { SubtitleBlock } from "../lib/blocks/types";
import { registerMedia, seekTo } from "../lib/player";

/** Waveform zoom in pixels per second; `FIT` lets the whole clip fill the pane. */
const FIT = 0;
const ZOOM_MIN = 4;
const ZOOM_MAX = 600;
const ZOOM_FACTOR = 1.4;

const REGION_COLOR = "rgba(122, 162, 247, 0.14)";
const REGION_COLOR_ALT = "rgba(122, 162, 247, 0.24)";

/** Region labels live in wavesurfer's shadow DOM, so style them inline. */
function regionLabel(block: SubtitleBlock, index: number): HTMLElement {
  const el = document.createElement("span");
  el.textContent = `#${index + 1} ${block.text}`;
  Object.assign(el.style, {
    fontSize: "10px",
    lineHeight: "1.2",
    color: "#c0caf5",
    padding: "2px 4px",
    display: "block",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    pointerEvents: "none",
  });
  return el;
}

/** Video/audio player with a wavesurfer waveform bound to the same media element. */
export function PlayerPane() {
  const {
    mediaUrl,
    mediaKind,
    blocks,
    currentTime,
    setCurrentTime,
    setTimes,
    appendLog,
  } = useAppStore();
  const activeBlock = findActiveBlock(blocks, currentTime);

  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const regionMap = useRef(new Map<string, Region>());
  /** Blocks change mid-drag from the ripple; don't fight the region being dragged. */
  const draggingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState<number>(FIT);

  useEffect(() => {
    const el = mediaRef.current;
    const container = waveRef.current;
    if (!el || !container || !mediaUrl) return;

    registerMedia(el);
    const regions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container,
      media: el,
      height: 72,
      waveColor: "#3f4a5a",
      progressColor: "#7aa2f7",
      cursorColor: "#c0caf5",
      barWidth: 2,
      barGap: 1,
      autoScroll: true,
      autoCenter: true,
      plugins: [regions],
    });
    ws.on("ready", () => {
      setReady(true);
      appendLog("Waveform rendered", "ok");
    });
    ws.on("error", (e) => appendLog(`Waveform error: ${e}`, "err"));
    wsRef.current = ws;
    regionsRef.current = regions;

    // `timeupdate` only fires a few times a second, which is too coarse for the
    // subtitle overlay, so track playback per frame and fall back to the event
    // for seeks while paused.
    let frame = 0;
    const tick = () => {
      setCurrentTime(el.currentTime);
      frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const onStop = () => cancelAnimationFrame(frame);
    const onTime = () => setCurrentTime(el.currentTime);

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onStop);
    el.addEventListener("ended", onStop);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeked", onTime);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onStop);
      el.removeEventListener("ended", onStop);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeked", onTime);
      registerMedia(null);
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
      regionMap.current.clear();
      setReady(false);
    };
  }, [mediaUrl, appendLog, setCurrentTime]);

  // Dragging or resizing a region retimes its block, ripple included.
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !ready) return;
    const onUpdate = () => {
      draggingRef.current = true;
    };
    const onUpdated = (region: Region) => {
      draggingRef.current = false;
      setTimes(region.id, region.start, region.end);
    };
    const onClicked = (region: Region) => seekTo(region.start);
    regions.on("region-update", onUpdate);
    regions.on("region-updated", onUpdated);
    regions.on("region-clicked", onClicked);
    return () => {
      regions.un("region-update", onUpdate);
      regions.un("region-updated", onUpdated);
      regions.un("region-clicked", onClicked);
    };
  }, [ready, setTimes]);

  // Mirror blocks as regions, reusing the existing ones so dragging stays smooth.
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !ready || draggingRef.current) return;
    const seen = new Set(blocks.map((b) => b.id));

    for (const [id, region] of regionMap.current) {
      if (!seen.has(id)) {
        region.remove();
        regionMap.current.delete(id);
      }
    }

    blocks.forEach((block, i) => {
      const color = i % 2 === 0 ? REGION_COLOR : REGION_COLOR_ALT;
      const existing = regionMap.current.get(block.id);
      if (existing) {
        existing.setOptions({ start: block.start, end: block.end, color });
        existing.setContent(regionLabel(block, i));
        return;
      }
      regionMap.current.set(
        block.id,
        regions.addRegion({
          id: block.id,
          start: block.start,
          end: block.end,
          color,
          content: regionLabel(block, i),
          drag: true,
          resize: true,
          minLength: MIN_BLOCK_DURATION,
        }),
      );
    });
  }, [blocks, ready]);

  const applyZoom = useCallback((next: number) => {
    const ws = wsRef.current;
    if (!ws) return;
    setZoom(next);
    if (next === FIT) ws.setOptions({ fillParent: true, minPxPerSec: 1 });
    else ws.zoom(next);
  }, []);

  // Modifier + wheel zooms; a plain wheel keeps scrolling the waveform.
  useEffect(() => {
    const container = waveRef.current;
    if (!container || !ready) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) return;
      e.preventDefault();
      const ws = wsRef.current;
      const base =
        zoom === FIT
          ? container.clientWidth / Math.max(ws?.getDuration() ?? 1, 0.001)
          : zoom;
      const scaled = e.deltaY < 0 ? base * ZOOM_FACTOR : base / ZOOM_FACTOR;
      applyZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scaled)));
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [ready, zoom, applyZoom]);

  const zoomBy = (factor: number) => {
    const ws = wsRef.current;
    const container = waveRef.current;
    if (!ws || !container) return;
    const base =
      zoom === FIT
        ? container.clientWidth / Math.max(ws.getDuration(), 0.001)
        : zoom;
    applyZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, base * factor)));
  };

  if (!mediaUrl) {
    return (
      <div className="player-pane empty">
        Open a video or audio file to start
      </div>
    );
  }

  return (
    <div className="player-pane">
      {mediaKind === "audio" ? (
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          src={mediaUrl}
          controls
          className="media audio-only"
        />
      ) : (
        <div className="media-frame">
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={mediaUrl}
            controls
            className="media"
          />
          {activeBlock && (
            <div className="subtitle-overlay">
              <span>{activeBlock.text}</span>
            </div>
          )}
        </div>
      )}
      <div ref={waveRef} className="waveform" />
      <div className="wave-controls">
        <button onClick={() => zoomBy(1 / ZOOM_FACTOR)} title="Zoom out">
          −
        </button>
        <button onClick={() => zoomBy(ZOOM_FACTOR)} title="Zoom in">
          +
        </button>
        <button
          onClick={() => applyZoom(FIT)}
          disabled={zoom === FIT}
          title="Fit the whole clip"
        >
          Fit
        </button>
        <span className="muted zoom-hint">
          {zoom === FIT ? "whole clip" : `${Math.round(zoom)} px/s`} · drag
          blocks to retime · ⌘-scroll to zoom
        </span>
      </div>
    </div>
  );
}
