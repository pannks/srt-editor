import { useEffect, useRef } from "react";
import { useAppStore } from "../state/store";

const STATUS_ICON = { info: "·", run: "▸", ok: "✓", err: "✕" } as const;

/** Detailed live log of every processing step. */
export function ProcessPanel() {
  const log = useAppStore((s) => s.log);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  return (
    <aside className="process-panel">
      <h3>Process</h3>
      <div className="process-log">
        {log.length === 0 && <p className="muted">No activity yet.</p>}
        {log.map((e) => (
          <div key={e.id} className={`log-entry ${e.status}`}>
            <span className="log-time">{e.time}</span>
            <span className="log-icon">{STATUS_ICON[e.status]}</span>
            <span className="log-msg">{e.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </aside>
  );
}
