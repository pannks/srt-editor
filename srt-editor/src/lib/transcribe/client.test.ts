import { describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { parseSegmentsJson, stripFences, transcribeChunk } from "./client";
import { DEFAULT_TRANSCRIPTION } from "./types";

describe("stripFences", () => {
  it("unwraps a ```json fence", () => {
    expect(stripFences('```json\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });

  it("unwraps a bare ``` fence", () => {
    expect(stripFences("```\n[]\n```")).toBe("[]");
  });

  it("leaves unfenced text alone", () => {
    expect(stripFences(' [{"a":1}] ')).toBe('[{"a":1}]');
  });

  it("leaves an inner fence alone", () => {
    expect(stripFences('[{"text":"```"}]')).toBe('[{"text":"```"}]');
  });
});

describe("parseSegmentsJson", () => {
  it("accepts a fenced reply, as OpenAI-compatible models often answer", () => {
    const out = parseSegmentsJson(
      '```json\n[{"start":0,"end":1.5,"text":"hi"}]\n```',
    );
    expect(out).toEqual([{ start: 0, end: 1.5, text: "hi" }]);
  });

  it("drops malformed entries and sorts by start", () => {
    const out = parseSegmentsJson(
      '[{"start":2,"end":3,"text":"b"},{"start":0,"end":1,"text":"a"},{"start":"x","end":1,"text":"bad"},{"start":0,"end":1,"text":"  "}]',
    );
    expect(out.map((s) => s.text)).toEqual(["a", "b"]);
  });

  it("clamps end to start", () => {
    const out = parseSegmentsJson('[{"start":5,"end":4,"text":"x"}]');
    expect(out[0].end).toBe(5);
  });

  it("rejects non-JSON", () => {
    expect(() => parseSegmentsJson("sorry, I cannot")).toThrow(/not valid JSON/);
  });

  it("rejects a non-array", () => {
    expect(() => parseSegmentsJson('{"a":1}')).toThrow(/not an array/);
  });

  it("salvages complete objects from a truncated reply", () => {
    // Ollama's 4096-token default cuts the array off mid-object.
    const truncated =
      '[{"start":0,"end":2,"text":"first"},{"start":2,"end":4,"text":"second"},{"start":4,"end';
    const out = parseSegmentsJson(truncated);
    expect(out.map((s) => s.text)).toEqual(["first", "second"]);
  });

  it("ignores prose wrapped around the array", () => {
    const out = parseSegmentsJson(
      'Here you go:\n[{"start":0,"end":1,"text":"hi"}]\nHope that helps!',
    );
    expect(out).toEqual([{ start: 0, end: 1, text: "hi" }]);
  });

  it("keeps a cleanly parsed empty array (a silent chunk) as no segments", () => {
    expect(parseSegmentsJson("[]")).toEqual([]);
  });
});

describe("transcribeChunk", () => {
  it("routes an ACP provider to the agent command, not the HTTP one", async () => {
    invoke.mockResolvedValueOnce('[{"start":0,"end":1,"text":"hi"}]');
    const settings = {
      ...DEFAULT_TRANSCRIPTION,
      provider: "acp" as const,
      agentCmd: "gemini --experimental-acp",
    };
    const out = await transcribeChunk(settings, "/tmp/chunk-000.wav");
    expect(out).toEqual([{ start: 0, end: 1, text: "hi" }]);
    expect(invoke).toHaveBeenCalledWith("acp_transcribe_chunk", {
      chunkPath: "/tmp/chunk-000.wav",
      command: "gemini --experimental-acp",
      prompt: settings.prompt,
    });
  });

  it("keeps HTTP providers on transcribe_chunk", async () => {
    invoke.mockResolvedValueOnce("[]");
    await transcribeChunk(DEFAULT_TRANSCRIPTION, "/tmp/chunk-000.wav");
    expect(invoke).toHaveBeenLastCalledWith(
      "transcribe_chunk",
      expect.objectContaining({ api: "gemini" }),
    );
  });
});
