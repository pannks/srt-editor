import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Languages,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore, type Settings } from "../state/store";
import { toast } from "../state/toasts";
import { useT } from "../state/useT";
import { isThemeMode } from "../lib/theme";
import { DEFAULT_PROMPT } from "../lib/gemini/prompt";
import {
  MAX_CHUNK_SECS,
  MIN_CHUNK_SECS,
  RECOMMENDED_TRANSCRIBE_MODEL,
  TRANSCRIBE_PROVIDERS,
  normalizeTranscription,
} from "../lib/transcribe/types";
import {
  applySettingsProfile,
  profileFromSettings,
  profileSummary,
} from "../lib/profiles";
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

type Tab = "general" | "transcription" | "translation" | "profiles" | "export";

const TABS: { id: Tab; labelKey: TKey }[] = [
  { id: "general", labelKey: "settings.tab.general" },
  { id: "transcription", labelKey: "settings.tab.transcription" },
  { id: "translation", labelKey: "settings.tab.translation" },
  { id: "profiles", labelKey: "settings.tab.profiles" },
  { id: "export", labelKey: "settings.tab.export" },
];

/** The two model stages share one UI: provider, key, model, detect, test. */
type Stage = "transcription" | "translation";

interface StageUi {
  models: ModelOption[];
  detecting: boolean;
  detectError: string | null;
  testBusy: boolean;
  testOk: boolean;
  testMessage: string | null;
  showKey: boolean;
}

const EMPTY_STAGE_UI: StageUi = {
  models: [],
  detecting: false,
  detectError: null,
  testBusy: false,
  testOk: false,
  testMessage: null,
  showKey: false,
};

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
  const [profileName, setProfileName] = useState("");
  const [stageUi, setStageUi] = useState<Record<Stage, StageUi>>({
    transcription: EMPTY_STAGE_UI,
    translation: EMPTY_STAGE_UI,
  });

  const patch = (fields: Partial<Settings>) =>
    setDraft((d) => ({ ...d, ...fields }));
  const patchTranslation = (fields: Partial<TranslationSettings>) =>
    setDraft((d) => ({ ...d, translation: { ...d.translation, ...fields } }));
  const patchStage = useCallback(
    (stage: Stage, fields: Record<string, unknown>) =>
      setDraft((d) => ({ ...d, [stage]: { ...d[stage], ...fields } })),
    [],
  );
  const patchUi = useCallback(
    (stage: Stage, fields: Partial<StageUi>) =>
      setStageUi((s) => ({ ...s, [stage]: { ...s[stage], ...fields } })),
    [],
  );

  const detectStage = useCallback(
    async (
      stage: Stage,
      cfg: { provider: string; baseUrl: string; apiKey: string; model: string },
    ) => {
      patchUi(stage, { detecting: true, detectError: null });
      try {
        const found = await listModels(cfg.provider, cfg.baseUrl, cfg.apiKey);
        patchUi(stage, { detecting: false, models: found });
        // Nothing sensible was pre-filled — take the provider at its word.
        if (!cfg.model && found.length > 0) {
          patchStage(stage, { model: found[0].id });
        }
      } catch (e) {
        patchUi(stage, { detecting: false, models: [], detectError: String(e) });
      }
    },
    [patchStage, patchUi],
  );

  // A local server can be asked for its models straight away; a cloud one only
  // once there is a key to ask with.
  useEffect(() => {
    if (tab !== "transcription" && tab !== "translation") return;
    const cfg = draft[tab];
    if (providerSpec(cfg.provider).needsKey && cfg.apiKey.trim() === "") {
      patchUi(tab, { models: [] });
      return;
    }
    void detectStage(tab, cfg);
    // Re-detecting on every keystroke of the URL or key would hammer the
    // endpoint; the Detect button covers those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, draft.transcription.provider, draft.translation.provider]);

  const changeProvider = (stage: Stage, id: ProviderId) => {
    const known = stageUi[stage].models.map((m) => m.id);
    patchUi(stage, { ...EMPTY_STAGE_UI });
    setDraft((d) => ({ ...d, [stage]: applyProvider(d[stage], id, known) }));
  };

  const runTest = async (stage: Stage) => {
    patchUi(stage, { testBusy: true, testMessage: null, testOk: false });
    const { provider, baseUrl, apiKey, model } = draft[stage];
    try {
      await pingProvider({ api: providerApi(provider), baseUrl, apiKey, model });
      patchUi(stage, {
        testBusy: false,
        testOk: true,
        testMessage: t("settings.testOk", {
          model,
          url: baseUrl || providerSpec(provider).baseUrl,
        }),
      });
    } catch (e) {
      patchUi(stage, { testBusy: false, testOk: false, testMessage: String(e) });
    }
  };

  const saveProfile = () => {
    const name = profileName.trim();
    if (!name) return;
    setDraft((d) => ({
      ...d,
      profiles: [...d.profiles, profileFromSettings(name, d)],
    }));
    setProfileName("");
    toast.ok(t("profiles.saved", { name }));
  };

  const loadProfile = (id: string) => {
    const profile = draft.profiles.find((p) => p.id === id);
    if (!profile) return;
    setDraft((d) => applySettingsProfile(d, profile));
    toast.info(t("profiles.applied", { name: profile.name }));
  };

  const deleteProfile = (id: string) =>
    setDraft((d) => ({
      ...d,
      profiles: d.profiles.filter((p) => p.id !== id),
    }));

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
      transcription: normalizeTranscription(draft.transcription),
      translation: normalizeTranslation(draft.translation),
    });
    appendLog(t("log.settingsSaved"), "ok");
    toast.ok(t("log.settingsSaved"));
    onClose();
  };

  const namePreview = buildExportName(draft.exportPrefix, draft.exportPattern, {
    mediaPath,
    projectName,
    lang: draft.translation.targets[0] ?? "",
  });

  /**
   * Provider + key + model + detect + test for one stage. A render helper, not
   * a component: mounting a fresh component type per render would remount the
   * inputs and drop focus on every keystroke.
   */
  const renderProviderFields = (
    stage: Stage,
    providers: { local: typeof LOCAL_PROVIDERS; cloud: typeof CLOUD_PROVIDERS },
  ) => {
    const cfg = draft[stage];
    const ui = stageUi[stage];
    const spec = providerSpec(cfg.provider);
    return (
      <>
        <label>
          {t("settings.translationProvider")}
          <select
            value={cfg.provider}
            onChange={(e) => changeProvider(stage, e.target.value as ProviderId)}
          >
            <optgroup label={t("settings.providerLocalGroup")}>
              {providers.local.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("settings.providerCloudGroup")}>
              {providers.cloud.map((p) => (
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
              value={cfg.baseUrl}
              spellCheck={false}
              onChange={(e) => patchStage(stage, { baseUrl: e.target.value })}
            />
            <small className="muted">{t("settings.baseUrlHint")}</small>
          </label>
        )}

        <label>
          {t("settings.apiKey")}
          <span className="input-with-button">
            <input
              type={ui.showKey ? "text" : "password"}
              value={cfg.apiKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => patchStage(stage, { apiKey: e.target.value })}
            />
            <button
              type="button"
              className="icon-only reveal"
              aria-pressed={ui.showKey}
              title={ui.showKey ? t("settings.hideKey") : t("settings.showKey")}
              aria-label={
                ui.showKey ? t("settings.hideKey") : t("settings.showKey")
              }
              onClick={() => patchUi(stage, { showKey: !ui.showKey })}
            >
              {ui.showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </span>
        </label>

        <label>
          {stage === "transcription"
            ? t("settings.model")
            : t("settings.translationModel")}
          <span className="field-row">
            <input
              type="text"
              value={cfg.model}
              spellCheck={false}
              onChange={(e) => patchStage(stage, { model: e.target.value })}
            />
            <button
              onClick={() => detectStage(stage, cfg)}
              disabled={ui.detecting}
            >
              {ui.detecting ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {ui.detecting ? t("settings.detecting") : t("settings.detectModels")}
            </button>
          </span>
          {/* A select beside the field rather than a datalist on it:
              WKWebView gives a datalist no way to open, so the detected
              models were unreachable. The text field stays authoritative,
              because /models under-reports what a server will serve. */}
          {ui.models.length > 0 && (
            <select
              value={
                ui.models.some((m) => m.id === cfg.model) ? cfg.model : ""
              }
              onChange={(e) =>
                e.target.value && patchStage(stage, { model: e.target.value })
              }
            >
              <option value="">
                {t("settings.chooseModel", { count: ui.models.length })}
              </option>
              {ui.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          {ui.models.length === 0 &&
            !ui.detecting &&
            spec.needsKey &&
            cfg.apiKey.trim() === "" && (
              <small className="muted">{t("settings.modelsNeedKey")}</small>
            )}
        </label>
        {ui.detectError && <p className="form-error">{ui.detectError}</p>}

        <div className="modal-actions">
          <button onClick={() => runTest(stage)} disabled={ui.testBusy}>
            <Plug size={14} />
            {ui.testBusy ? t("settings.testing") : t("settings.testConnection")}
          </button>
        </div>
        {ui.testMessage && (
          <p className={ui.testOk ? "form-ok" : "form-error"}>{ui.testMessage}</p>
        )}
      </>
    );
  };

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

          {tab === "transcription" && (
            <>
              {renderProviderFields("transcription", {
                local: TRANSCRIBE_PROVIDERS.filter((p) => p.local),
                cloud: TRANSCRIBE_PROVIDERS.filter((p) => !p.local),
              })}
              <small className="muted">
                {t("settings.recommendedModel", {
                  model: RECOMMENDED_TRANSCRIBE_MODEL,
                })}{" "}
                {t("settings.audioModelHint")}
              </small>
              <label>
                {t("settings.chunk")}
                <input
                  type="number"
                  value={draft.transcription.chunkSecs}
                  min={MIN_CHUNK_SECS}
                  max={MAX_CHUNK_SECS}
                  onChange={(e) =>
                    patchStage("transcription", {
                      chunkSecs: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                {t("settings.prompt")}
                <textarea
                  rows={9}
                  value={draft.transcription.prompt}
                  onChange={(e) =>
                    patchStage("transcription", { prompt: e.target.value })
                  }
                />
              </label>
              <button
                onClick={() =>
                  patchStage("transcription", { prompt: DEFAULT_PROMPT })
                }
              >
                <RotateCcw size={14} /> {t("settings.resetPrompt")}
              </button>
            </>
          )}

          {tab === "translation" && (
            <>
              {renderProviderFields("translation", {
                local: LOCAL_PROVIDERS,
                cloud: CLOUD_PROVIDERS,
              })}

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

          {tab === "profiles" && (
            <>
              <label>
                {t("profiles.name")}
                <span className="field-row">
                  <input
                    type="text"
                    value={profileName}
                    spellCheck={false}
                    onChange={(e) => setProfileName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveProfile()}
                  />
                  <button onClick={saveProfile} disabled={!profileName.trim()}>
                    <Plus size={14} /> {t("profiles.saveCurrent")}
                  </button>
                </span>
                <small className="muted">{t("profiles.hint")}</small>
              </label>

              {draft.profiles.length === 0 ? (
                <p className="muted">{t("profiles.empty")}</p>
              ) : (
                <div className="project-list">
                  {draft.profiles.map((p) => (
                    <div key={p.id} className="project">
                      <div className="project-main">
                        <strong>{p.name}</strong>
                        <span className="muted">{profileSummary(p)}</span>
                      </div>
                      <button
                        onClick={() => loadProfile(p.id)}
                        title={t("profiles.applyHint")}
                      >
                        {t("profiles.apply")}
                      </button>
                      <button
                        className="danger icon-only"
                        onClick={() => deleteProfile(p.id)}
                        title={t("profiles.delete")}
                        aria-label={t("profiles.delete")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
