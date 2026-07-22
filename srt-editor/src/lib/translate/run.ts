import type { SubtitleBlock } from "../blocks/types";
import { languageName } from "../i18n/languages";
import {
  batchToUserMessage,
  buildBatchesFor,
  parseTranslationJson,
  pendingIndices,
  renderPrompt,
  type TranslationBatch,
} from "./batch";
import { chatComplete } from "./client";
import { providerApi } from "./providers";
import { normalizeTranslation, type TranslationSettings } from "./types";

export interface TranslateCallbacks {
  log: (message: string, status?: "info" | "run" | "ok" | "err") => void;
  /** Called around every request so the toolbar can show how far along it is. */
  progress: (done: number, total: number) => void;
  /** Results land block by block, so the list fills in while the run continues. */
  apply: (lang: string, indices: number[], results: Map<number, string>) => void;
  /** Polled between requests; `true` ends the run cleanly, keeping what landed. */
  shouldStop?: () => boolean;
}

export interface TranslateOptions {
  /** Redo blocks that already have a translation, instead of only the gaps. */
  retranslateAll?: boolean;
}

/** One request. Failure is logged and swallowed: a bad batch must not end the run. */
async function runBatch(
  batch: TranslationBatch,
  lang: string,
  label: string,
  system: string,
  settings: TranslationSettings,
  cb: TranslateCallbacks,
): Promise<void> {
  const startedAt = Date.now();
  try {
    const reply = await chatComplete({
      api: providerApi(settings.provider),
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      system,
      user: batchToUserMessage(batch),
    });
    const results = parseTranslationJson(reply);
    cb.apply(lang, batch.indices, results);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    cb.log(
      `${label}: ${results.size}/${batch.items.length} line(s) in ${elapsed}s`,
      results.size === batch.items.length ? "ok" : "info",
    );
  } catch (e) {
    cb.log(`${label} failed: ${e instanceof Error ? e.message : e}`, "err");
  }
}

function prepare(raw: TranslationSettings) {
  const settings = normalizeTranslation(raw);
  if (settings.targets.length === 0) throw new Error("no target languages set");
  if (!settings.model.trim()) throw new Error("no translation model set");
  const source = settings.sourceLanguage
    ? languageName(settings.sourceLanguage)
    : "";
  return { settings, source };
}

/**
 * Translate into every target language, one batch per request.
 *
 * **Only the blocks still missing that language are sent**, so pressing
 * Translate again after a stop, a crash or a run of failed batches costs only
 * what is left. `retranslateAll` overrides that and redoes everything.
 *
 * Texts are read once up front: `apply` writes translations, never the source
 * text, so the batches stay valid for the whole run even though the store is
 * updated in between.
 */
export async function translateBlocks(
  blocks: SubtitleBlock[],
  raw: TranslationSettings,
  cb: TranslateCallbacks,
  options: TranslateOptions = {},
): Promise<void> {
  const { settings, source } = prepare(raw);
  if (blocks.length === 0) throw new Error("nothing to translate");

  const texts = blocks.map((b) => b.text.trim());
  const everyIndex = texts.map((_, i) => i);
  const work = settings.targets.map((lang) => {
    const indices = options.retranslateAll
      ? everyIndex
      : pendingIndices(blocks, lang);
    return {
      lang,
      batches: buildBatchesFor(
        texts,
        indices,
        settings.batchSize,
        settings.contextBlocks,
      ),
      remaining: indices.length,
    };
  });

  const total = work.reduce((sum, w) => sum + w.batches.length, 0);
  const blocksLeft = work.reduce((sum, w) => sum + w.remaining, 0);
  if (total === 0) {
    cb.log("Every block is already translated — nothing to do", "ok");
    return;
  }

  cb.log(
    `Translating ${blocksLeft} block(s) across ${settings.targets.length} language(s) — ` +
      `${total} request(s) of ${settings.batchSize}, ±${settings.contextBlocks} block(s) of context`,
    "run",
  );

  let done = 0;
  for (const { lang, batches, remaining } of work) {
    const target = languageName(lang);
    if (batches.length === 0) {
      cb.log(`${target}: already complete, skipped`, "ok");
      continue;
    }
    const skipped = blocks.length - remaining;
    cb.log(
      `${target}: ${remaining} block(s) with ${settings.model}` +
        (skipped > 0 ? ` (${skipped} already translated)` : ""),
      "run",
    );

    const system = renderPrompt(settings.prompt, source, target);
    for (const [i, batch] of batches.entries()) {
      if (cb.shouldStop?.()) {
        // Everything applied so far stays; the next press resumes from here.
        cb.log(`Stopped — ${total - done} request(s) not sent`, "info");
        return;
      }
      cb.progress(done, total);
      await runBatch(
        batch,
        lang,
        `${target} ${i + 1}/${batches.length}`,
        system,
        settings,
        cb,
      );
      done += 1;
    }
    cb.log(`${target}: done`, "ok");
  }
  cb.progress(total, total);
}

/**
 * Re-translate a single block, still surrounded by its neighbours so the model
 * sees the same context it would during a full run.
 */
export async function translateBlockAt(
  blocks: SubtitleBlock[],
  index: number,
  raw: TranslationSettings,
  cb: TranslateCallbacks,
  languages?: string[],
): Promise<void> {
  const { settings, source } = prepare(raw);
  const block = blocks[index];
  if (!block) throw new Error(`no block at ${index}`);

  const texts = blocks.map((b) => b.text.trim());
  const pad = settings.contextBlocks;
  const batch: TranslationBatch = {
    indices: [index],
    items: [{ n: 1, text: texts[index] }],
    before: texts.slice(Math.max(0, index - pad), index),
    after: texts.slice(index + 1, index + 1 + pad),
  };

  const targets = languages?.length ? languages : settings.targets;
  const total = targets.length;
  let done = 0;
  for (const lang of targets) {
    const target = languageName(lang);
    cb.progress(done, total);
    await runBatch(
      batch,
      lang,
      `${target} block #${index + 1}`,
      renderPrompt(settings.prompt, source, target),
      settings,
      cb,
    );
    done += 1;
  }
  cb.progress(total, total);
}
