import type { SubtitleBlock } from "../blocks/types";

/**
 * One request's worth of work: the lines to translate plus the neighbouring
 * lines that go along read-only, which is what keeps a sentence split across
 * three cues from being translated three unrelated ways.
 */
export interface TranslationBatch {
  /** Positions in the block array, in order. */
  indices: number[];
  /** `n` is 1-based within the batch and is what the model echoes back. */
  items: { n: number; text: string }[];
  /** Lines immediately before the batch — context only. */
  before: string[];
  /** Lines immediately after the batch — context only. */
  after: string[];
}

/**
 * Batch a chosen subset of the blocks. Context still comes from the full list,
 * so resuming a half-finished run reads the lines around the gap — including
 * ones already translated — exactly as the first pass would have.
 */
export function buildBatchesFor(
  texts: string[],
  indices: number[],
  batchSize: number,
  context: number,
): TranslationBatch[] {
  const size = Math.max(1, Math.floor(batchSize));
  const pad = Math.max(0, Math.floor(context));
  const batches: TranslationBatch[] = [];
  for (let at = 0; at < indices.length; at += size) {
    const slice = indices.slice(at, at + size);
    const first = slice[0];
    const last = slice[slice.length - 1];
    batches.push({
      indices: slice,
      items: slice.map((index, n) => ({ n: n + 1, text: texts[index] })),
      before: texts.slice(Math.max(0, first - pad), first),
      after: texts.slice(last + 1, Math.min(texts.length, last + 1 + pad)),
    });
  }
  return batches;
}

/** Split every text into batches, each carrying `context` neighbours on both sides. */
export function buildBatches(
  texts: string[],
  batchSize: number,
  context: number,
): TranslationBatch[] {
  return buildBatchesFor(
    texts,
    texts.map((_, i) => i),
    batchSize,
    context,
  );
}

/**
 * Positions still missing a translation in `lang` — what a second Translate
 * press works on, so an interrupted run picks up where it stopped instead of
 * paying for every block again.
 */
export function pendingIndices(
  blocks: { text: string; translations?: Record<string, string> }[],
  lang: string,
): number[] {
  const out: number[] = [];
  blocks.forEach((block, i) => {
    if (block.text.trim() === "") return;
    if ((block.translations?.[lang] ?? "").trim() === "") out.push(i);
  });
  return out;
}

/** Render the batch as the user message: context, then the JSON to translate. */
export function batchToUserMessage(batch: TranslationBatch): string {
  const parts: string[] = [];
  if (batch.before.length > 0) {
    parts.push(
      `Context before (do not translate):\n${batch.before
        .map((t) => `- ${t}`)
        .join("\n")}`,
    );
  }
  parts.push(
    `Lines to translate:\n${JSON.stringify(
      batch.items.map(({ n, text }) => ({ n, text })),
    )}`,
  );
  if (batch.after.length > 0) {
    parts.push(
      `Context after (do not translate):\n${batch.after
        .map((t) => `- ${t}`)
        .join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

/** Fill `{source}` / `{target}` in the prompt template. */
export function renderPrompt(
  template: string,
  source: string,
  target: string,
): string {
  return template
    .split("{source}")
    .join(source || "the spoken language")
    .split("{target}")
    .join(target);
}

/**
 * Pull the translations out of the model's reply, keyed by the `n` it was given.
 * Local models like to wrap JSON in prose or a ``` fence, so the array is
 * located rather than assumed; a bare array of strings is accepted too.
 */
export function parseTranslationJson(raw: string): Map<number, string> {
  const out = new Map<number, string>();
  const array = extractArray(raw);
  if (!array) throw new Error(`no JSON array in the reply: ${preview(raw)}`);
  array.forEach((item, i) => {
    if (typeof item === "string") {
      if (item.trim() !== "") out.set(i + 1, item.trim());
      return;
    }
    if (typeof item !== "object" || item === null) return;
    const { n, text } = item as Record<string, unknown>;
    const key = typeof n === "number" ? n : Number(n);
    const value = typeof text === "string" ? text.trim() : "";
    if (!Number.isFinite(key) || value === "") return;
    out.set(key, value);
  });
  if (out.size === 0) throw new Error(`no usable translations: ${preview(raw)}`);
  return out;
}

function extractArray(raw: string): unknown[] | null {
  const fenced = raw.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("[");
  const end = fenced.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const preview = (raw: string) => `${raw.trim().slice(0, 120)}…`;

/**
 * Write a batch's results onto the blocks. Blocks the model skipped keep the
 * translation they already had, so a partial reply never wipes earlier work.
 */
export function applyTranslations(
  blocks: SubtitleBlock[],
  lang: string,
  indices: number[],
  results: Map<number, string>,
): SubtitleBlock[] {
  const patch = new Map<number, string>();
  indices.forEach((blockIndex, i) => {
    const text = results.get(i + 1);
    if (text) patch.set(blockIndex, text);
  });
  if (patch.size === 0) return blocks;
  return blocks.map((block, i) => {
    const text = patch.get(i);
    if (text === undefined) return block;
    return { ...block, translations: { ...block.translations, [lang]: text } };
  });
}

/** Drop one language from every block — used when a target is removed. */
export function stripLanguage(
  blocks: SubtitleBlock[],
  lang: string,
): SubtitleBlock[] {
  return blocks.map((block) => {
    if (!block.translations || !(lang in block.translations)) return block;
    const { [lang]: _dropped, ...rest } = block.translations;
    return {
      ...block,
      translations: Object.keys(rest).length > 0 ? rest : undefined,
    };
  });
}
