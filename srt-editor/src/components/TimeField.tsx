import { useEffect, useRef, useState } from "react";
import { formatTimecode, parseFlexibleTime } from "../lib/srt/time";

const NUDGE = 0.05;
const NUDGE_COARSE = 0.5;
/** Seconds per pixel of horizontal drag. */
const SCRUB_PER_PX = 0.02;
/** Movement below this is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

interface Props {
  value: number;
  onCommit: (seconds: number) => void;
  title: string;
}

/**
 * Timecode input that can also be scrubbed. Drag left/right to slide the value,
 * click to type, arrows and the wheel to nudge. Accepts `12.5`, `1:05.3` or
 * `0:01:05,300`; commits on blur or Enter and reverts unparseable text.
 */
export function TimeField({ value, onCommit, title }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ x: number; from: number; moved: boolean } | null>(
    null,
  );
  const [draft, setDraft] = useState(() => formatTimecode(value));
  const [editing, setEditing] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(formatTimecode(value));
  }, [value, editing]);

  /** Move the draft with the value — blur would otherwise commit stale text. */
  const apply = (seconds: number) => {
    const next = Math.max(0, seconds);
    setDraft(formatTimecode(next));
    onCommit(next);
  };

  const commit = () => {
    setEditing(false);
    try {
      onCommit(parseFlexibleTime(draft));
    } catch {
      setDraft(formatTimecode(value));
    }
  };

  // Wheel adjusts only while focused, so scrolling the block list past a field
  // never hijacks the scroll. React's wheel listener is passive, hence native.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_COARSE : NUDGE;
      apply(value + (e.deltaY < 0 ? step : -step));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
      return;
    }
    if (e.key === "Escape") {
      setDraft(formatTimecode(value));
      setEditing(false);
      e.currentTarget.blur();
      return;
    }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const step = e.shiftKey ? NUDGE_COARSE : NUDGE;
    apply(value + (e.key === "ArrowUp" ? step : -step));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (editing) return; // typing already — leave caret placement alone
    e.preventDefault(); // suppress focus and text selection until we know it's a click
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, from: value, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLInputElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    setScrubbing(true);
    apply(drag.from + dx * (e.shiftKey ? SCRUB_PER_PX / 4 : SCRUB_PER_PX));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setScrubbing(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (drag && !drag.moved) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <input
      ref={inputRef}
      className={`time-field${scrubbing ? " scrubbing" : ""}`}
      type="text"
      title={`${title} — drag to scrub, click to type`}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
