import { useState } from "react";
import { useAppStore } from "../state/store";
import {
  DEFAULT_CHUNK_SECS,
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
} from "../lib/gemini/prompt";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, saveSettings, appendLog } = useAppStore();
  const [draft, setDraft] = useState(settings);

  const apply = () => {
    saveSettings({
      ...draft,
      chunkSecs: Math.min(Math.max(draft.chunkSecs || DEFAULT_CHUNK_SECS, 30), 1800),
    });
    appendLog("Settings saved", "ok");
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <label>
          Gemini API key
          <input
            type="password"
            value={draft.apiKey}
            placeholder="AIza…"
            onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
          />
        </label>
        <label>
          Model
          <input
            type="text"
            value={draft.model}
            placeholder={DEFAULT_MODEL}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          />
        </label>
        <label>
          Chunk length (seconds, 30–1800)
          <input
            type="number"
            value={draft.chunkSecs}
            min={30}
            max={1800}
            onChange={(e) =>
              setDraft({ ...draft, chunkSecs: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Transcription prompt
          <textarea
            rows={8}
            value={draft.prompt}
            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
          />
        </label>
        <div className="modal-actions">
          <button
            onClick={() => setDraft({ ...draft, prompt: DEFAULT_PROMPT })}
          >
            Reset prompt
          </button>
          <span className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={apply}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
