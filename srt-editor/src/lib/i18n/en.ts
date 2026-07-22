/**
 * English is the source dictionary: every other locale is typed against its
 * keys, so a missing string is a compile error rather than a blank label.
 */
export const en = {
  "app.name": "SRT Studio",

  "toolbar.openMedia": "Open media",
  "toolbar.generate": "Generate SRT",
  "toolbar.working": "Working…",
  "toolbar.transcribing": "Transcribing {done}/{total}…",
  "toolbar.openSrt": "Open SRT",
  "toolbar.openSrtHint": "Edit an existing subtitle file",
  "toolbar.export": "Export",
  "toolbar.projects": "Projects",
  "toolbar.projectsHint": "Save or open a project stored in the local database",
  "toolbar.settings": "Settings",
  "toolbar.translate": "Translate",
  "toolbar.translating": "Translating {done}/{total}…",
  "toolbar.translateHint":
    "Translate the blocks still missing a translation — press again after a stop to carry on",
  "toolbar.stop": "Stop",
  "toolbar.stopping": "Stopping…",
  "toolbar.stopHint":
    "Finish the request in flight and stop. What has been translated is kept.",
  "toolbar.about": "About",
  "toolbar.close": "Close",
  "toolbar.closeHint": "Clear the media, the blocks and the open project",
  "toolbar.layoutTop": "Top",
  "toolbar.layoutSide": "Sidebar",
  "toolbar.layoutHint": "Player above the blocks, or beside them (fits 9:16 video)",
  "toolbar.unsaved": "unsaved",
  "toolbar.openProject": "Open project",
  "toolbar.version": "App version",

  "export.original": "Original",
  "export.bilingual": "{lang} under the original",
  "export.everything": "Every language, into a folder…",
  "export.noTargets": "Add target languages in Settings › Translation",

  "close.confirm":
    "Close the workspace? Unsaved blocks and the open project will be cleared.",

  "player.empty": "Open a video or audio file, or drop one here",
  "player.drop": "Drop the file to open it",
  "player.waveLoading": "Reading waveform…",
  "player.waveEmpty": "Empty track — {error}. Timing and editing still work.",
  "player.zoomOut": "Zoom out",
  "player.zoomIn": "Zoom in",
  "player.fit": "Fit the whole clip",
  "player.wholeClip": "whole clip",
  "player.zoomHint": "{zoom} · drag blocks to retime · ⌘-scroll to zoom",

  "blocks.empty": "No subtitle blocks yet.",
  "blocks.seek": "Seek player to this block",
  "blocks.start": "Start — arrows nudge, Shift for larger steps",
  "blocks.end": "End — arrows nudge, Shift for larger steps",
  "blocks.mergePrev": "Merge into the previous block (or Backspace at the start of the text)",
  "blocks.mergeNext": "Merge with the next block (or Delete at the end of the text)",
  "blocks.merge": "merge",
  "blocks.cut": "cut",
  "blocks.cutHint": "Cut in two at the caret (⌘/Ctrl+Enter)",
  "blocks.delete": "Delete block",
  "blocks.translationPlaceholder": "Not translated yet",
  "blocks.retranslate": "Translate this block again",

  "process.title": "Process",

  "settings.title": "Settings",
  "settings.close": "Close",
  "settings.cancel": "Cancel",
  "settings.save": "Save",
  "settings.tab.general": "General",
  "settings.tab.model": "Model & prompt",
  "settings.tab.translation": "Translation",
  "settings.tab.export": "Export",

  "settings.uiLanguage": "Interface language",
  "settings.layout": "Layout",
  "settings.layoutTop": "Player on top",
  "settings.layoutSide": "Player in a sidebar",
  "settings.showTranslations": "Show translations under the original text",
  "settings.overlayLanguages": "Languages shown under the video overlay",
  "settings.overlayHint":
    "Each ticked language gets its own line under the original, in this order.",
  "settings.overlayNoLanguages":
    "Nothing to preview yet — add target languages in Settings › Translation.",
  "settings.selectAll": "All",
  "settings.selectNone": "None",

  "settings.apiKey": "Gemini API key",
  "settings.model": "Transcription model",
  "settings.chunk": "Chunk length (seconds, 30–1800)",
  "settings.prompt": "Transcription prompt",
  "settings.resetPrompt": "Reset prompt",
  "settings.showKey": "Show the key",
  "settings.hideKey": "Hide the key",

  "settings.translationProvider": "Provider",
  "settings.providerLocalGroup": "On this machine",
  "settings.providerCloudGroup": "Cloud",
  "settings.baseUrl": "Base URL",
  "settings.baseUrlHint": "Endpoint root, ending in the API version path.",
  "settings.translationKey": "API key (blank for a local server)",
  "settings.translationModel": "Translation model",
  "settings.detectModels": "Detect",
  "settings.detecting": "Detecting…",
  "settings.chooseModel": "Pick one of the {count} detected model(s)…",
  "settings.modelsNeedKey": "Enter the API key to list this provider's models.",
  "settings.sourceLanguage": "Source language",
  "settings.sourceAuto": "Detect automatically",
  "settings.targetLanguages": "Target languages",
  "settings.targetHint": "Each selected language gets its own line under every block.",
  "settings.contextBlocks": "Context blocks before / after (0–10)",
  "settings.contextHint":
    "Neighbouring lines are sent as read-only context so the model keeps the thread.",
  "settings.batchSize": "Blocks per request (1–50)",
  "settings.translationPrompt": "Translation prompt",
  "settings.testConnection": "Test connection",
  "settings.testing": "Testing…",
  "settings.testOk": "Reached {model} at {url}",

  "settings.exportPrefix": "File name prefix",
  "settings.exportPrefixHint": "Prepended verbatim, e.g. “final-”.",
  "settings.exportPattern": "File name pattern",
  "settings.exportPatternHint":
    "Tokens: {media} media file name · {project} project name · {lang} language code · {date} YYYY-MM-DD. Dots become dashes so .srt is the only extension.",
  "settings.exportPreview": "Preview",

  "projects.title": "Projects",
  "projects.reload": "Reload",
  "projects.name": "Project name",
  "projects.save": "Save",
  "projects.saveAsNew": "Save as new",
  "projects.empty": "Nothing saved yet.",
  "projects.open": "Open",
  "projects.delete": "Delete project",
  "projects.blocks": "{count} block(s)",
  "projects.export": "Export file…",
  "projects.exportHint":
    "Write this project to one shareable file — subtitles, translations and settings, without any API key. The media itself is referenced, not included.",
  "projects.import": "Import file…",
  "projects.importHint": "Open a project file someone shared with you",

  "about.title": "About",
  "about.tagline": "Generate, edit and translate subtitles.",
  "about.version": "App version",
  "about.bundle": "Bundle version",
  "about.identifier": "Identifier",
  "about.tauri": "Tauri",
  "about.platform": "Platform",
  "about.database": "Database",
  "about.ffmpeg": "ffmpeg",
  "about.unavailable": "not available",
  "about.mismatch":
    "The interface and the bundle report different versions — this build is stale. Run `bun run version` and rebuild.",

  "log.settingsSaved": "Settings saved",
  "log.opened": "Opened {kind}: {path}",
  "log.workspaceClosed": "Workspace closed",
  "log.noTranslationTargets":
    "No target languages set — open Settings › Translation first.",
  "log.projectExported": "Project file written: {path}",
  "log.projectImported": "Imported “{name}” (exported by v{app}) — Save to keep it here",
  "log.projectMediaMissing":
    "The media “{name}” is not on this machine — open your own copy to see the video",
} as const;

export type TKey = keyof typeof en;
export type Dict = Record<TKey, string>;
