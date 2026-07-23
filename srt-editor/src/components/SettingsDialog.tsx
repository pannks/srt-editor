import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Languages,
  Loader2,
  Plug,
  RefreshCw,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { useAppStore, type Settings } from "../state/store";
import { toast } from "../state/toasts";
import { useT } from "../state/useT";
import { isThemeMode } from "../lib/theme";
import {
  DEFAULT_CHUNK_SECS,
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
} from "../lib/gemini/prompt";
import {
  applyProvider,
  DEFAULT_TRANSLATION_PROMPT,
  MAX_BATCH_SIZE,
  MAX_CONTEXT_BLOCKS,
  MIN_BATCH_SIZE,
  normalizeTranslation,
  type TranslationSettings,
} from "../lib/translate/types";
import {
  CLOUD_PROVIDERS,
  LOCAL_PROVIDERS,
  providerApi,
  providerSpec,
  type ModelOption,
  type ProviderId,
} from "../lib/translate/providers";
import { listModels, pingProvider } from "../lib/translate/client";
import { UI_LANGUAGES, isUiLanguage, type TKey } from "../lib/i18n";
import { SUBTITLE_LANGUAGES, languageLabel } from "../lib/i18n/languages";
import { translatedLanguages } from "../lib/blocks/translations";
import { buildExportName } from "../lib/srt/naming";
import { APP_VERSION } from "../lib/version";

type Tab = "general" | "model" | "translation" | "export";

const TABS: { id: Tab; labelKey: TKey }[] = [
  { id: "general", labelKey: "settings.tab.general" },
  { id: "model", labelKey: "settings.tab.model" },
  { id: "translation", labelKey: "settings.tab.translation" },
  { id: "export", labelKey: "settings.tab.export" },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useAppStore((s) => s.settings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const appendLog = useAppStore((s) => s.appendLog);
  const mediaPath = useAppStore((s) => s.mediaPath);
  const projectName = useAppStore((s) => s.projectName);
  const blocks = useAppStore((s) => s.blocks);
  const t = useT();

  const [tab, setTab] = useState<Tab>("general");
  const [draft, setDraft] = useState<Settings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [showTranslationKey, setShowTranslationKey] = useState(false);
  const [test, setTest] = useState<{ busy: boolean; message: string | null; ok: boolean }>(
    { busy: false, message: null, ok: false },
  );
  const [models, setModels] = useState<ModelOption[]>([]);
  const [detect, setDetect] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });

  const spec = providerSpec(draft.translation.provider);

  const patch = (fields: Partial<Settings>) =>
    setDraft((d) => ({ ...d, ...fields }));
  const patchTranslation = (fields: Partial<TranslationSettings>) =>
    setDraft((d) => ({ ...d, translation: { ...d.translation, ...fields } }));

  const detectModels = useCallback(
    async (translation: TranslationSettings) => {
      setDetect({ busy: true, error: null });
      try {
        const found = await listModels(
          translation.provider,
          translation.baseUrl,
          translation.apiKey,
        );
        setModels(found);
        setDetect({ busy: false, error: null });
        // Nothing sensible was pre-filled — take the provider at its word.
        if (!translation.model && found.length > 0) {
          patchTranslation({ model: found[0].id });
        }
      } catch (e) {
        setModels([]);
        setDetect({ busy: false, error: String(e) });
      }
    },
    [],
  );

  // A local server can be asked for its models straight away; a cloud one only
  // once there is a key to ask with.
  useEffect(() => {
    if (tab !== "translation") return;
    if (spec.needsKey && draft.translation.apiKey.trim() === "") {
      setModels([]);
      return;
    }
    void detectModels(draft.translation);
    // Re-detecting on every keystroke of the URL or key would hammer the
    // endpoint; the Detect button covers those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, draft.translation.provider]);

  const changeProvider = (id: ProviderId) => {
    setModels([]);
    setDetect({ busy: false, error: null });
    setTest({ busy: false, message: null, ok: false });
    setDraft((d) => ({
      ...d,
      translation: applyProvider(
        d.translation,
        id,
        models.map((m) => m.id),
      ),
    }));
  };

  // Anything worth previewing: a configured target, or a language the blocks
  // already carry from an earlier run or an imported project.
  const overlayChoices = [
    ...new Set([...draft.translation.targets, ...translatedLanguages(blocks)]),
  ];

  const toggleOverlay = (code: string) =>
    patch({
      overlayLanguages: draft.overlayLanguages.includes(code)
        ? draft.overlayLanguages.filter((c) => c !== code)
        : [...draft.overlayLanguages, code],
    });

  const toggleTarget = (code: string) =>
    patchTranslation({
      targets: draft.translation.targets.includes(code)
        ? draft.translation.targets.filter((c) => c !== code)
        : [...draft.translation.targets, code],
    });

  const apply = () => {
    saveSettings({
      ...draft,
      chunkSecs: Math.min(
        Math.max(draft.chunkSecs || DEFAULT_CHUNK_SECS, 30),
        1800,
      ),
      translation: normalizeTranslation(draft.translation),
    });
    appendLog(t("log.settingsSaved"), "ok");
    toast.ok(t("log.settingsSaved"));
    onClose();
  };

  const runTest = async () => {
    setTest({ busy: true, message: null, ok: false });
    const { provider, baseUrl, apiKey, model } = draft.translation;
    try {
      await pingProvider({ api: providerApi(provider), baseUrl, apiKey, model });
      setTest({
        busy: false,
        ok: true,
        message: t("settings.testOk", { model, url: baseUrl }),
      });
    } catch (e) {
      setTest({ busy: false, ok: false, message: String(e) });
    }
  };

  const namePreview = buildExportName(draft.exportPrefix, draft.exportPattern, {
    mediaPath,
    projectName,
    lang: draft.translation.targets[0] ?? "",
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>
          {t("settings.title")}
          <span className="spacer" />
          <button className="icon-only" title={t("settings.close")} onClick={onClose}>
            <X size={14} />
          </button>
        </h2>

        <div className="tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "tab current" : "tab"}
              onClick={() => setTab(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        <div className="tab-panel">
          {tab === "general" && (
            <>
              <label>
                {t("settings.uiLanguage")}
                <select
                  value={draft.uiLanguage}
                  onChange={(e) =>
                    isUiLanguage(e.target.value) &&
                    patch({ uiLanguage: e.target.value })
                  }
                >
                  {UI_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("settings.theme")}
                <select
                  value={draft.theme}
                  onChange={(e) =>
                    isThemeMode(e.target.value) && patch({ theme: e.target.value })
                  }
                >
                  <option value="dark">{t("settings.themeDark")}</option>
                  <option value="light">{t("settings.themeLight")}</option>
                  <option value="system">{t("settings.themeSystem")}</option>
                </select>
              </label>
              <label>
                {t("settings.layout")}
                <select
                  value={draft.layout}
                  onChange={(e) =>
                    patch({ layout: e.target.value === "side" ? "side" : "top" })
                  }
                >
                  <option value="top">{t("settings.layoutTop")}</option>
                  <option value="side">{t("settings.layoutSide")}</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.showTranslations}
                  onChange={(e) => patch({ showTranslations: e.target.checked })}
                />
                {t("settings.showTranslations")}
              </label>
              <fieldset className="language-picker">
                <legend>{t("settings.overlayLanguages")}</legend>
                {overlayChoices.length === 0 ? (
                  <small className="muted">{t("settings.overlayNoLanguages")}</small>
                ) : (
                  <>
                    <div className="language-grid">
                      {overlayChoices.map((code) => (
                        <label key={code} className="check">
                          <input
                            type="checkbox"
                            checked={draft.overlayLanguages.includes(code)}
                            onChange={() => toggleOverlay(code)}
                          />
                          {languageLabel(code)}
                        </label>
                      ))}
                    </div>
                    <span className="field-row">
                      <button
                        onClick={() => patch({ overlayLanguages: overlayChoices })}
                      >
                        {t("settings.selectAll")}
                      </button>
                      <button onClick={() => patch({ overlayLanguages: [] })}>
                        {t("settings.selectNone")}
                      </button>
                    </span>
                  </>
                )}
                <small className="muted">{t("settings.overlayHint")}</small>
              </fieldset>
            </>
          )}

          {tab === "model" && (
            <>
              <label>
                {t("settings.apiKey")}
                <span className="input-with-button">
                  <input
                    type={showKey ? "text" : "password"}
                    value={draft.apiKey}
                    placeholder="AIza…"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => patch({ apiKey: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-only reveal"
                    title={showKey ? t("settings.hideKey") : t("settings.showKey")}
                    aria-label={
                      showKey ? t("settings.hideKey") : t("settings.showKey")
                    }
                    aria-pressed={showKey}
                    onClick={() => setShowKey((v) => !v)}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </span>
              </label>
              <label>
                {t("settings.model")}
                <input
                  type="text"
                  value={draft.model}
                  placeholder={DEFAULT_MODEL}
                  onChange={(e) => patch({ model: e.target.value })}
                />
              </label>
              <label>
                {t("settings.chunk")}
                <input
                  type="number"
                  value={draft.chunkSecs}
                  min={30}
                  max={1800}
                  onChange={(e) => patch({ chunkSecs: Number(e.target.value) })}
                />
              </label>
              <label>
                {t("settings.prompt")}
                <textarea
                  rows={9}
                  value={draft.prompt}
                  onChange={(e) => patch({ prompt: e.target.value })}
                />
              </label>
              <button onClick={() => patch({ prompt: DEFAULT_PROMPT })}>
                <RotateCcw size={14} /> {t("settings.resetPrompt")}
              </button>
            </>
          )}

          {tab === "translation" && (
            <>
              <label>
                {t("settings.translationProvider")}
                <select
                  value={draft.translation.provider}
                  onChange={(e) => changeProvider(e.target.value as ProviderId)}
                >
                  <optgroup label={t("settings.providerLocalGroup")}>
                    {LOCAL_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("settings.providerCloudGroup")}>
                    {CLOUD_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

              {spec.editableBaseUrl && (
                <label>
                  {t("settings.baseUrl")}
                  <input
                    type="text"
                    value={draft.translation.baseUrl}
                    spellCheck={false}
                    onChange={(e) => patchTranslation({ baseUrl: e.target.value })}
                  />
                  <small className="muted">{t("settings.baseUrlHint")}</small>
                </label>
              )}

              <label>
                {t("settings.translationKey")}
                <span className="input-with-button">
                  <input
                    type={showTranslationKey ? "text" : "password"}
                    value={draft.translation.apiKey}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => patchTranslation({ apiKey: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-only reveal"
                    aria-pressed={showTranslationKey}
                    title={
                      showTranslationKey
                        ? t("settings.hideKey")
                        : t("settings.showKey")
                    }
                    onClick={() => setShowTranslationKey((v) => !v)}
                  >
                    {showTranslationKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </span>
              </label>

              <label>
                {t("settings.translationModel")}
                <span className="field-row">
                  <input
                    type="text"
                    value={draft.translation.model}
                    spellCheck={false}
                    onChange={(e) => patchTranslation({ model: e.target.value })}
                  />
                  <button
                    onClick={() => detectModels(draft.translation)}
                    disabled={detect.busy}
                  >
                    {detect.busy ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    {detect.busy
                      ? t("settings.detecting")
                      : t("settings.detectModels")}
                  </button>
                </span>
                {/* A select beside the field rather than a datalist on it:
                    WKWebView gives a datalist no way to open, so the detected
                    models were unreachable. The text field stays authoritative,
                    because /models under-reports what a server will serve. */}
                {models.length > 0 && (
                  <select
                    value={
                      models.some((m) => m.id === draft.translation.model)
                        ? draft.translation.model
                        : ""
                    }
                    onChange={(e) =>
                      e.target.value && patchTranslation({ model: e.target.value })
                    }
                  >
                    <option value="">
                      {t("settings.chooseModel", { count: models.length })}
                    </option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                )}
                {models.length === 0 &&
                  !detect.busy &&
                  spec.needsKey &&
                  draft.translation.apiKey.trim() === "" && (
                    <small className="muted">{t("settings.modelsNeedKey")}</small>
                  )}
              </label>
              {detect.error && <p className="form-error">{detect.error}</p>}

              <div className="modal-actions">
                <button onClick={runTest} disabled={test.busy}>
                  <Plug size={14} />
                  {test.busy ? t("settings.testing") : t("settings.testConnection")}
                </button>
              </div>
              {test.message && (
                <p className={test.ok ? "form-ok" : "form-error"}>{test.message}</p>
              )}

              <label>
                {t("settings.sourceLanguage")}
                <select
                  value={draft.translation.sourceLanguage}
                  onChange={(e) =>
                    patchTranslation({ sourceLanguage: e.target.value })
                  }
                >
                  <option value="">{t("settings.sourceAuto")}</option>
                  {SUBTITLE_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {languageLabel(l.code)}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="language-picker">
                <legend>
                  <Languages size={13} /> {t("settings.targetLanguages")}
                </legend>
                <div className="language-grid">
                  {SUBTITLE_LANGUAGES.map((l) => (
                    <label key={l.code} className="check">
                      <input
                        type="checkbox"
                        checked={draft.translation.targets.includes(l.code)}
                        onChange={() => toggleTarget(l.code)}
                      />
                      {l.native} <span className="muted">({l.code})</span>
                    </label>
                  ))}
                </div>
                <small className="muted">{t("settings.targetHint")}</small>
              </fieldset>

              <label>
                {t("settings.contextBlocks")}
                <input
                  type="number"
                  min={0}
                  max={MAX_CONTEXT_BLOCKS}
                  value={draft.translation.contextBlocks}
                  onChange={(e) =>
                    patchTranslation({ contextBlocks: Number(e.target.value) })
                  }
                />
                <small className="muted">{t("settings.contextHint")}</small>
              </label>

              <label>
                {t("settings.batchSize")}
                <input
                  type="number"
                  min={MIN_BATCH_SIZE}
                  max={MAX_BATCH_SIZE}
                  value={draft.translation.batchSize}
                  onChange={(e) =>
                    patchTranslation({ batchSize: Number(e.target.value) })
                  }
                />
              </label>

              <label>
                {t("settings.translationPrompt")}
                <textarea
                  rows={9}
                  value={draft.translation.prompt}
                  onChange={(e) => patchTranslation({ prompt: e.target.value })}
                />
              </label>
              <button
                onClick={() =>
                  patchTranslation({ prompt: DEFAULT_TRANSLATION_PROMPT })
                }
              >
                <RotateCcw size={14} /> {t("settings.resetPrompt")}
              </button>
            </>
          )}

          {tab === "export" && (
            <>
              <label>
                {t("settings.exportPrefix")}
                <input
                  type="text"
                  value={draft.exportPrefix}
                  spellCheck={false}
                  onChange={(e) => patch({ exportPrefix: e.target.value })}
                />
                <small className="muted">{t("settings.exportPrefixHint")}</small>
              </label>
              <label>
                {t("settings.exportPattern")}
                <input
                  type="text"
                  value={draft.exportPattern}
                  spellCheck={false}
                  onChange={(e) => patch({ exportPattern: e.target.value })}
                />
                <small className="muted">{t("settings.exportPatternHint")}</small>
              </label>
              <p className="muted">
                {t("settings.exportPreview")}: <code>{namePreview}</code>
              </p>
            </>
          )}
        </div>

        <div className="modal-actions">
          <span className="spacer" />
          <span className="muted app-version">v{APP_VERSION}</span>
          <button onClick={onClose}>{t("settings.cancel")}</button>
          <button className="primary" onClick={apply}>
            <Save size={14} /> {t("settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
