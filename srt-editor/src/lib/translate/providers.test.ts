import { describe, expect, it } from "vitest";
import {
  CLOUD_PROVIDERS,
  LOCAL_PROVIDERS,
  migrateProviderId,
  modelsUrl,
  parseModelList,
  providerApi,
  providerSpec,
  PROVIDERS,
} from "./providers";
import { applyProvider, DEFAULT_TRANSLATION, normalizeTranslation } from "./types";

describe("catalogue", () => {
  it("splits into local and cloud with nothing lost", () => {
    expect(LOCAL_PROVIDERS.length + CLOUD_PROVIDERS.length).toBe(
      PROVIDERS.length,
    );
    expect(LOCAL_PROVIDERS.map((p) => p.id)).toContain("ollama");
    expect(CLOUD_PROVIDERS.map((p) => p.id)).toEqual(
      expect.arrayContaining(["anthropic", "openai", "gemini"]),
    );
  });

  it("maps each provider to its wire protocol", () => {
    expect(providerApi("ollama")).toBe("openai");
    expect(providerApi("lmstudio")).toBe("openai");
    expect(providerApi("anthropic")).toBe("anthropic");
    expect(providerApi("gemini")).toBe("gemini");
  });

  it("requires a key for every cloud provider and none locally", () => {
    for (const p of CLOUD_PROVIDERS) expect(p.needsKey, p.id).toBe(true);
    for (const p of LOCAL_PROVIDERS) expect(p.needsKey, p.id).toBe(false);
  });

  it("falls back to a local provider for an unknown id", () => {
    expect(providerSpec("nonsense").local).toBe(true);
  });
});

describe("migrateProviderId", () => {
  it("reads the old catch-all `openai` from the URL it was paired with", () => {
    expect(migrateProviderId("openai", "http://localhost:11434/v1")).toBe("ollama");
    expect(migrateProviderId("openai", "http://localhost:1234/v1")).toBe("lmstudio");
    expect(migrateProviderId("openai", "http://127.0.0.1:8080/v1")).toBe("local");
    expect(migrateProviderId("openai", "https://openrouter.ai/api/v1")).toBe("cloud");
    expect(migrateProviderId("openai", "https://api.openai.com/v1")).toBe("openai");
  });

  it("leaves a known id alone", () => {
    expect(migrateProviderId("anthropic", "")).toBe("anthropic");
    expect(migrateProviderId("gemini", "")).toBe("gemini");
  });
});

describe("modelsUrl", () => {
  it("hangs /models off the configured base for a self-hosted server", () => {
    expect(modelsUrl("ollama", "http://localhost:11434/v1/")).toBe(
      "http://localhost:11434/v1/models",
    );
  });

  it("ignores a stale base URL for a fixed-endpoint provider", () => {
    expect(modelsUrl("anthropic", "http://localhost:11434/v1")).toBe(
      "https://api.anthropic.com/v1/models",
    );
  });
});

describe("parseModelList", () => {
  it("reads the OpenAI shape, which Ollama and LM Studio also use", () => {
    const body = '{"data":[{"id":"qwen3:8b"},{"id":"llama3.2"}]}';
    expect(parseModelList("openai", body).map((m) => m.id)).toEqual([
      "llama3.2",
      "qwen3:8b",
    ]);
  });

  it("labels Anthropic models with their display name", () => {
    const body =
      '{"data":[{"id":"claude-sonnet-5","display_name":"Claude Sonnet 5"}]}';
    expect(parseModelList("anthropic", body)[0]).toEqual({
      id: "claude-sonnet-5",
      label: "Claude Sonnet 5 (claude-sonnet-5)",
    });
  });

  it("strips the models/ prefix and drops anything that cannot chat", () => {
    const body = JSON.stringify({
      models: [
        {
          name: "models/gemini-x",
          displayName: "Gemini X",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/embedding-1",
          supportedGenerationMethods: ["embedContent"],
        },
      ],
    });
    const out = parseModelList("gemini", body);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("gemini-x");
  });

  it("de-duplicates", () => {
    const body = '{"data":[{"id":"a"},{"id":"a"}]}';
    expect(parseModelList("openai", body)).toHaveLength(1);
  });

  it("throws on a non-JSON or shapeless reply", () => {
    expect(() => parseModelList("openai", "<html>")).toThrow();
    expect(() => parseModelList("openai", '{"ok":true}')).toThrow();
  });
});

describe("applyProvider", () => {
  it("moves the base URL to the new provider's", () => {
    const out = applyProvider(DEFAULT_TRANSLATION, "anthropic");
    expect(out.baseUrl).toBe("https://api.anthropic.com/v1");
    expect(out.model).toBe("claude-sonnet-5");
  });

  it("keeps a model the new provider also has", () => {
    const settings = { ...DEFAULT_TRANSLATION, model: "gpt-4o-mini" };
    const out = applyProvider(settings, "openai", ["gpt-4o-mini"]);
    expect(out.model).toBe("gpt-4o-mini");
  });

  it("never carries a model across wire protocols", () => {
    const settings = { ...DEFAULT_TRANSLATION, model: "qwen3:8b" };
    const out = applyProvider(settings, "gemini", ["qwen3:8b"]);
    expect(out.model).not.toBe("qwen3:8b");
  });
});

describe("normalizeTranslation", () => {
  it("migrates a stored legacy provider id", () => {
    const out = normalizeTranslation({
      ...DEFAULT_TRANSLATION,
      provider: "openai" as never,
      baseUrl: "http://localhost:11434/v1",
    });
    expect(out.provider).toBe("ollama");
  });

  it("pins a fixed-endpoint provider back to its own URL", () => {
    const out = normalizeTranslation({
      ...DEFAULT_TRANSLATION,
      provider: "anthropic",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(out.baseUrl).toBe("https://api.anthropic.com/v1");
  });

  it("clamps the batch and context numbers", () => {
    const out = normalizeTranslation({
      ...DEFAULT_TRANSLATION,
      batchSize: 999,
      contextBlocks: -4,
    });
    expect(out.batchSize).toBe(50);
    expect(out.contextBlocks).toBe(0);
  });

  it("de-duplicates the target list", () => {
    const out = normalizeTranslation({
      ...DEFAULT_TRANSLATION,
      targets: ["th", "th", "", "en"],
    });
    expect(out.targets).toEqual(["th", "en"]);
  });
});
