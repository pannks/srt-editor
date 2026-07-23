import { useAppStore } from "../state/store";
import { useT } from "../state/useT";

/**
 * Thin strip along the toolbar's bottom edge while a run is in flight.
 * Determinate once the pipeline reports counts, indeterminate before that
 * (uploading / waiting on the first response).
 */
export function OpProgress() {
  const generating = useAppStore((s) => s.generating);
  const translating = useAppStore((s) => s.translating);
  const exporting = useAppStore((s) => s.exporting);
  const progress = useAppStore((s) => s.progress);
  const translateProgress = useAppStore((s) => s.translateProgress);
  const exportProgress = useAppStore((s) => s.exportProgress);
  const t = useT();

  if (!generating && !translating && !exporting) return null;
  const p = generating ? progress : translating ? translateProgress : exportProgress;
  const pct = p && p.total > 0 ? Math.min(100, (p.done / p.total) * 100) : null;
  const label = exporting
    ? t("captions.exporting")
    : p
      ? t(generating ? "toolbar.transcribing" : "toolbar.translating", {
          done: p.done,
          total: p.total,
        })
      : t("progress.preparing");

  return (
    <div className="op-progress" role="progressbar" aria-label={label}>
      <div
        className={pct === null ? "op-fill indeterminate" : "op-fill"}
        style={pct === null ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}
