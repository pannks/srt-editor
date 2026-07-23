import { useState } from "react";
import { Clock, X } from "lucide-react";
import { useAppStore } from "../state/store";
import { toast } from "../state/toasts";
import { useT } from "../state/useT";
import { shiftBlocks, stretchBlocks } from "../lib/blocks/timing";

/** Batch retiming: shift every block by an offset, or stretch all times by a factor. */
export function TimingDialog({ onClose }: { onClose: () => void }) {
  const blocks = useAppStore((s) => s.blocks);
  const applyBulkEdit = useAppStore((s) => s.applyBulkEdit);
  const t = useT();

  const [offset, setOffset] = useState("0");
  const [factor, setFactor] = useState("1");

  const applyOffset = () => {
    const secs = Number(offset);
    if (!Number.isFinite(secs) || secs === 0) return;
    applyBulkEdit(shiftBlocks(blocks, secs));
    toast.ok(t("tools.shifted", { count: blocks.length, secs }));
    onClose();
  };

  const applyStretch = () => {
    const f = Number(factor);
    if (!Number.isFinite(f) || f <= 0 || f === 1) return;
    applyBulkEdit(stretchBlocks(blocks, f));
    toast.ok(t("tools.stretched", { count: blocks.length, factor: f }));
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          <Clock size={15} /> {t("tools.timing")}
          <span className="spacer" />
          <button
            className="icon-only"
            title={t("tools.close")}
            aria-label={t("tools.close")}
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </h2>

        <label>
          {t("tools.offset")}
          <span className="field-row">
            <input
              type="number"
              step={0.1}
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyOffset()}
            />
            <button onClick={applyOffset} disabled={Number(offset) === 0}>
              {t("tools.offsetApply")}
            </button>
          </span>
        </label>

        <label>
          {t("tools.stretch")}
          <span className="field-row">
            <input
              type="number"
              step={0.001}
              min={0}
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyStretch()}
            />
            <button
              onClick={applyStretch}
              disabled={!(Number(factor) > 0) || Number(factor) === 1}
            >
              {t("tools.stretchApply")}
            </button>
          </span>
        </label>

        <small className="muted">{t("tools.timingHint")}</small>
      </div>
    </div>
  );
}
