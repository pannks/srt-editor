import { useRef } from "react";

interface Props {
  /** Custom property on `.app` that holds the pane size, e.g. `--sidebar-w`. */
  cssVar: string;
  /** Current size in pixels, from settings. */
  width: number;
  min: number;
  max: number;
  /** Size to restore on double-click. */
  defaultWidth: number;
  /** `1` when the pane sits before the handle, `-1` when it sits after. */
  direction: 1 | -1;
  /** `x` resizes a column (default), `y` resizes a row above/below. */
  axis?: "x" | "y";
  className?: string;
  title: string;
  onCommit: (px: number) => void;
}

/**
 * Drag handle between two panes. While dragging it writes the size straight to
 * the CSS variable on `.app`, so resizing never re-renders the block list or the
 * waveform; the final size is committed to the store (and persisted) on release.
 */
export function Splitter({
  cssVar,
  width,
  min,
  max,
  defaultWidth,
  direction,
  axis = "x",
  className,
  title,
  onCommit,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ pos: number; from: number; latest: number } | null>(null);

  const host = () => ref.current?.closest(".app") as HTMLElement | null;

  const paint = (px: number) => host()?.style.setProperty(cssVar, `${px}px`);

  const pointerPos = (e: React.PointerEvent<HTMLDivElement>) =>
    axis === "x" ? e.clientX : e.clientY;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pos: pointerPos(e), from: width, latest: width };
    ref.current?.classList.add("dragging");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = Math.min(
      max,
      Math.max(min, d.from + (pointerPos(e) - d.pos) * direction),
    );
    d.latest = next;
    paint(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    ref.current?.classList.remove("dragging");
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (d && d.latest !== d.from) onCommit(d.latest);
  };

  return (
    <div
      ref={ref}
      className={className ? `splitter ${className}` : "splitter"}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      title={`${title} — drag to resize, double-click to reset`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => {
        paint(defaultWidth);
        onCommit(defaultWidth);
      }}
    />
  );
}
