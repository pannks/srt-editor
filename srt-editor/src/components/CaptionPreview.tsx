import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/store";
import {
  captionText,
  isWordAnimation,
  type CaptionLayer,
} from "../lib/captions/types";
import { wrapCaptionLines } from "../lib/captions/wrap";
import { layoutWords, timedWords, type TimedWord } from "../lib/captions/words";
import { findActiveBlock } from "../lib/blocks/active";
import { getMedia } from "../lib/player";
import type { SubtitleBlock } from "../lib/blocks/types";

/** `#rrggbb` + 0–1 opacity → CSS rgba(). */
function rgba(hex: string, opacity: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? m[1] : "000000";
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * The colour a word renders at for a word-driven animation, given the playhead.
 * Mirrors the ASS export: karaoke fills the read words (past + current) to the
 * accent while unread words stay the base text colour; highlight accents only
 * the current word; word shows only the current (handled by the caller). Both
 * the read and unread colours are the layer's own — nothing is hardcoded.
 */
function wordColor(
  animation: CaptionLayer["animation"],
  isActive: boolean,
  isPast: boolean,
  base: string,
  accent: string,
): string {
  if (animation === "karaoke") return isActive || isPast ? accent : base;
  if (animation === "highlight") return isActive ? accent : base;
  return base;
}

/**
 * One caption layer, draggable and live-styled over the video. A render helper
 * per layer so each stacks independently and remembers its own drag.
 */
function LayerSpan({
  layer,
  block,
  time,
  frameW,
  frameH,
  scale,
  container,
}: {
  layer: CaptionLayer;
  block: SubtitleBlock;
  /** Playhead in seconds, clamped into the block for the word animations. */
  time: number;
  frameW: number;
  frameH: number;
  scale: number;
  container: React.RefObject<HTMLDivElement | null>;
}) {
  const selectedId = useAppStore((s) => s.captionSelectedLayer);
  const selectLayer = useAppStore((s) => s.selectCaptionLayer);
  const updateLayer = useAppStore((s) => s.updateCaptionLayer);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const latest = useRef<{ x: number; y: number } | null>(null);

  const text = captionText(block, layer);
  if (text === "") return null;

  const pos = dragPos ?? { x: layer.posX, y: layer.posY };
  // No floor: the export has none either, so a floor here would make small
  // captions look bigger in the preview than in the burned video.
  const fontPx = (layer.fontSizePct / 100) * frameH;
  const family = layer.fontFamily || "Arial";
  const maxWidthPx = layer.widthPct * frameW;

  const o = layer.outlineWidth * scale;
  const outlineShadows =
    layer.outlineWidth > 0
      ? [
          `${o}px 0 0 ${layer.outlineColor}`,
          `-${o}px 0 0 ${layer.outlineColor}`,
          `0 ${o}px 0 ${layer.outlineColor}`,
          `0 -${o}px 0 ${layer.outlineColor}`,
          `${o}px ${o}px 0 ${layer.outlineColor}`,
          `-${o}px ${o}px 0 ${layer.outlineColor}`,
          `${o}px -${o}px 0 ${layer.outlineColor}`,
          `-${o}px -${o}px 0 ${layer.outlineColor}`,
        ]
      : [];
  const depth = layer.shadow * scale * 2;
  const shadows = [
    ...outlineShadows,
    ...(layer.shadow > 0 ? [`${depth}px ${depth}px ${depth}px rgba(0,0,0,0.8)`] : []),
  ].join(", ");

  const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v));

  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!latest.current || !container.current) return;
    const r = container.current.getBoundingClientRect();
    const next = {
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp((e.clientY - r.top) / r.height),
    };
    latest.current = next;
    setDragPos(next);
  };

  // The anchor point (posX/posY) maps to a corner/edge/centre of the box via
  // the same alignment the export uses; the transform hangs the box off it.
  const tx = { left: "0%", center: "-50%", right: "-100%" }[layer.alignH];
  const ty = { top: "0%", middle: "-50%", bottom: "-100%" }[layer.alignV];

  const wordy = isWordAnimation(layer.animation);

  // Static modes pre-wrap to whole lines; word modes lay out per word so each
  // can colour or reveal on the playhead. Both use the shared measurer, so the
  // breaks match the export.
  const staticLines = wordy
    ? []
    : wrapCaptionLines(text, maxWidthPx, fontPx, family, layer.bold);
  const wordLines: TimedWord[][] = wordy
    ? layoutWords(
        timedWords(text, block.start, block.end, layer.language),
        maxWidthPx,
        fontPx,
        family,
        layer.bold,
      )
    : [];

  const renderBody = () => {
    if (!wordy) return staticLines.join("\n");
    return wordLines.map((line, li) => (
      <span className="cap-line" key={li}>
        {line.map((w, wi) => {
          const isActive = time >= w.start && time < w.end;
          const isPast = time >= w.end;
          if (layer.animation === "word" && !isActive) return null;
          return (
            <span
              key={wi}
              className={`cap-word${isActive ? " active" : ""}`}
              style={{
                color: wordColor(
                  layer.animation,
                  isActive,
                  isPast,
                  layer.color,
                  layer.highlightColor,
                ),
              }}
            >
              {w.text}
            </span>
          );
        })}
      </span>
    ));
  };

  // Remount word content on the active word so `word`/`highlight` replay their
  // pop; the block+animation key covers fade/pop for the whole caption.
  const activeStart = wordy
    ? wordLines.flat().find((w) => time >= w.start && time < w.end)?.start
    : undefined;

  return (
    <span
      key={`${block.id}-${layer.animation}`}
      className={`caption-preview anim-${layer.animation}${
        wordy ? " wordy" : ""
      }${selectedId === layer.id ? " selected" : ""}`}
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        ["--cap-tx" as string]: tx,
        ["--cap-ty" as string]: ty,
        // Lines are pre-broken to match the export, so the box hugs its
        // content (max-content) and keeps our explicit breaks (pre).
        width: "max-content",
        whiteSpace: "pre",
        textAlign: layer.alignH,
        fontSize: `${fontPx}px`,
        fontFamily: `"${layer.fontFamily}", sans-serif`,
        fontWeight: layer.bold ? 700 : 400,
        color: layer.color,
        background: layer.bgEnabled
          ? rgba(layer.bgColor, layer.bgOpacity)
          : "transparent",
        textShadow: shadows,
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        selectLayer(layer.id);
        latest.current = { x: pos.x, y: pos.y };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (latest.current) {
          updateLayer(layer.id, {
            posX: latest.current.x,
            posY: latest.current.y,
          });
        }
        latest.current = null;
        setDragPos(null);
      }}
    >
      {/* Inner key remounts the animated content when the active word changes. */}
      {wordy ? (
        <span key={activeStart ?? "none"} className="cap-words">
          {renderBody()}
        </span>
      ) : (
        renderBody()
      )}
    </span>
  );
}

/**
 * Live, draggable preview of every burned-in caption layer over the video.
 * Sizes and outlines scale with the on-screen frame so the proportions match
 * the export.
 */
export function CaptionPreview({
  container,
}: {
  container: React.RefObject<HTMLDivElement | null>;
}) {
  const layers = useAppStore((s) => s.settings.captionLayers);
  const blocks = useAppStore((s) => s.blocks);
  const currentTime = useAppStore((s) => s.currentTime);

  // Track the frame's on-screen size reactively. Reading clientHeight during
  // render caught it at 0 before layout; observing once by ref identity left it
  // stuck when the frame settled to its real size later or the node was swapped
  // on a layout/media change. So: one ResizeObserver, re-pointed at the current
  // node on every render, plus a guarded re-measure that converges to the live
  // size — both size changes and node swaps now keep the font in step.
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const roRef = useRef<ResizeObserver | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!roRef.current) {
      roRef.current = new ResizeObserver(() => {
        const el = nodeRef.current;
        if (el) {
          setFrame((p) =>
            p.w === el.clientWidth && p.h === el.clientHeight
              ? p
              : { w: el.clientWidth, h: el.clientHeight },
          );
        }
      });
    }
    const el = container.current;
    if (el && el !== nodeRef.current) {
      if (nodeRef.current) roRef.current.unobserve(nodeRef.current);
      nodeRef.current = el;
      roRef.current.observe(el);
    }
    if (el) {
      setFrame((p) =>
        p.w === el.clientWidth && p.h === el.clientHeight
          ? p
          : { w: el.clientWidth, h: el.clientHeight },
      );
    }
  });
  useEffect(() => () => roRef.current?.disconnect(), []);

  // Preview the playhead's block, or the first one so there is always
  // something to drag and style.
  const active = findActiveBlock(blocks, currentTime) ?? blocks[0];
  if (!active) return null;

  const frameW = frame.w;
  const frameH = frame.h;
  const video = getMedia() as HTMLVideoElement | null;
  // Outline/shadow are in video pixels; scale them to the on-screen frame.
  const scale = video?.videoHeight ? frameH / video.videoHeight : 0.3;

  // When the playhead sits outside the previewed block (paused in the editor,
  // showing the first block), clamp into it so word animations show a sensible
  // mid-state instead of a blank or fully-dimmed caption.
  const time = Math.min(active.end, Math.max(active.start, currentTime));

  return (
    <>
      {layers.map((layer) => (
        <LayerSpan
          key={layer.id}
          layer={layer}
          block={active}
          time={time}
          frameW={frameW}
          frameH={frameH}
          scale={scale}
          container={container}
        />
      ))}
    </>
  );
}
