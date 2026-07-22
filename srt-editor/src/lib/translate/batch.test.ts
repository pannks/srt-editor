import { describe, expect, it } from "vitest";
import {
  applyTranslations,
  batchToUserMessage,
  buildBatches,
  buildBatchesFor,
  pendingIndices,
  parseTranslationJson,
  renderPrompt,
  stripLanguage,
} from "./batch";
import type { SubtitleBlock } from "../blocks/types";

const texts = ["one", "two", "three", "four", "five"];

const block = (id: string, text: string, translations?: Record<string, string>) =>
  ({ id, start: 0, end: 1, text, translations }) as SubtitleBlock;

describe("buildBatches", () => {
  it("covers every text exactly once", () => {
    const batches = buildBatches(texts, 2, 1);
    expect(batches.map((b) => b.indices)).toEqual([[0, 1], [2, 3], [4]]);
    expect(batches[0].items).toEqual([
      { n: 1, text: "one" },
      { n: 2, text: "two" },
    ]);
  });

  it("carries the neighbouring lines as context", () => {
    const [, middle] = buildBatches(texts, 2, 1);
    expect(middle.before).toEqual(["two"]);
    expect(middle.after).toEqual(["five"]);
  });

  it("clamps context at the ends", () => {
    const [first] = buildBatches(texts, 2, 5);
    expect(first.before).toEqual([]);
    expect(first.after).toEqual(["three", "four", "five"]);
  });

  it("numbers each batch from 1", () => {
    const [, second] = buildBatches(texts, 2, 0);
    expect(second.items.map((i) => i.n)).toEqual([1, 2]);
  });
});

describe("batchToUserMessage", () => {
  it("labels context and keeps it out of the JSON payload", () => {
    const [, middle] = buildBatches(texts, 2, 1);
    const message = batchToUserMessage(middle);
    expect(message).toContain("Context before");
    expect(message).toContain("Context after");
    expect(message).toContain('[{"n":1,"text":"three"},{"n":2,"text":"four"}]');
  });

  it("omits the context sections when there is none", () => {
    const [only] = buildBatches(["solo"], 5, 2);
    expect(batchToUserMessage(only)).not.toContain("Context");
  });
});

describe("renderPrompt", () => {
  it("fills both placeholders", () => {
    expect(renderPrompt("{source} -> {target}", "Thai", "English")).toBe(
      "Thai -> English",
    );
  });

  it("names the source generically when it is unknown", () => {
    expect(renderPrompt("from {source}", "", "Thai")).toBe(
      "from the spoken language",
    );
  });
});

describe("parseTranslationJson", () => {
  it("reads a plain object array", () => {
    const out = parseTranslationJson('[{"n":1,"text":"หนึ่ง"},{"n":2,"text":"สอง"}]');
    expect(out.get(1)).toBe("หนึ่ง");
    expect(out.get(2)).toBe("สอง");
  });

  it("digs the array out of a fenced, chatty reply", () => {
    const raw = 'Sure!\n```json\n[{"n":1,"text":"หนึ่ง"}]\n```\nHope that helps.';
    expect(parseTranslationJson(raw).get(1)).toBe("หนึ่ง");
  });

  it("accepts a bare array of strings, numbering it in order", () => {
    const out = parseTranslationJson('["a","b"]');
    expect(out.get(1)).toBe("a");
    expect(out.get(2)).toBe("b");
  });

  it("skips malformed entries but keeps the good ones", () => {
    const out = parseTranslationJson('[{"n":1,"text":""},{"n":2,"text":"ok"},3]');
    expect(out.size).toBe(1);
    expect(out.get(2)).toBe("ok");
  });

  it("throws when there is no array at all", () => {
    expect(() => parseTranslationJson("I cannot do that")).toThrow();
  });

  it("throws when the array holds nothing usable", () => {
    expect(() => parseTranslationJson("[]")).toThrow();
  });
});

describe("applyTranslations", () => {
  const blocks = [block("a", "one"), block("b", "two"), block("c", "three")];

  it("writes results onto the blocks the batch covered", () => {
    const out = applyTranslations(
      blocks,
      "th",
      [1, 2],
      new Map([
        [1, "สอง"],
        [2, "สาม"],
      ]),
    );
    expect(out[0].translations).toBeUndefined();
    expect(out[1].translations).toEqual({ th: "สอง" });
    expect(out[2].translations).toEqual({ th: "สาม" });
  });

  it("keeps other languages on the same block", () => {
    const withEn = [block("a", "one", { en: "one" })];
    const out = applyTranslations(withEn, "th", [0], new Map([[1, "หนึ่ง"]]));
    expect(out[0].translations).toEqual({ en: "one", th: "หนึ่ง" });
  });

  it("leaves earlier work alone when the model skips a line", () => {
    const partial = [block("a", "one", { th: "หนึ่ง" }), block("b", "two")];
    const out = applyTranslations(partial, "th", [0, 1], new Map([[2, "สอง"]]));
    expect(out[0].translations).toEqual({ th: "หนึ่ง" });
    expect(out[1].translations).toEqual({ th: "สอง" });
  });

  it("returns the same array when nothing matched", () => {
    expect(applyTranslations(blocks, "th", [0], new Map())).toBe(blocks);
  });
});

describe("stripLanguage", () => {
  it("removes one language and drops the map when it empties", () => {
    const blocks = [
      block("a", "one", { th: "หนึ่ง", en: "one" }),
      block("b", "two", { th: "สอง" }),
      block("c", "three"),
    ];
    const out = stripLanguage(blocks, "th");
    expect(out[0].translations).toEqual({ en: "one" });
    expect(out[1].translations).toBeUndefined();
    expect(out[2].translations).toBeUndefined();
  });
});

describe("pendingIndices", () => {
  const blocks = [
    block("a", "one", { th: "หนึ่ง" }),
    block("b", "two"),
    block("c", "three", { th: "   " }),
    block("d", "four", { en: "four" }),
  ];

  it("lists the blocks with no translation in that language", () => {
    expect(pendingIndices(blocks, "th")).toEqual([1, 2, 3]);
  });

  it("counts whitespace as untranslated", () => {
    expect(pendingIndices(blocks, "th")).toContain(2);
  });

  it("ignores other languages", () => {
    expect(pendingIndices(blocks, "en")).toEqual([0, 1, 2]);
  });

  it("is empty once a language is complete", () => {
    expect(pendingIndices([block("a", "one", { th: "x" })], "th")).toEqual([]);
  });

  it("skips blocks with no source text — there is nothing to translate", () => {
    expect(pendingIndices([block("a", "  ")], "th")).toEqual([]);
  });
});

describe("buildBatchesFor", () => {
  it("batches only the requested positions, keeping their real indices", () => {
    const batches = buildBatchesFor(texts, [1, 3, 4], 2, 0);
    expect(batches.map((b) => b.indices)).toEqual([[1, 3], [4]]);
    expect(batches[0].items).toEqual([
      { n: 1, text: "two" },
      { n: 2, text: "four" },
    ]);
  });

  it("takes context from the full list, including translated neighbours", () => {
    const [only] = buildBatchesFor(texts, [2], 5, 1);
    expect(only.before).toEqual(["two"]);
    expect(only.after).toEqual(["four"]);
  });

  it("matches buildBatches when every index is requested", () => {
    expect(buildBatchesFor(texts, [0, 1, 2, 3, 4], 2, 1)).toEqual(
      buildBatches(texts, 2, 1),
    );
  });

  it("has nothing to do for an empty selection", () => {
    expect(buildBatchesFor(texts, [], 2, 1)).toEqual([]);
  });
});
