import { describe, expect, it } from "bun:test";

import { CLIENT_SCOPE, SNIPPETS } from "./snippets";

const PARAMS = {
  cookie: "tp_v1_sealedtokenvalue",
  model: "claude-sonnet-5@default",
  proxyUrl: "https://gateway.example",
};

const byId = (id: string) => {
  const snippet = SNIPPETS.find((entry) => entry.id === id);
  if (!snippet) {
    throw new Error(`no snippet called ${id}`);
  }
  return snippet;
};

describe("snippets", () => {
  it("writes the credential and the model into every one", () => {
    for (const snippet of SNIPPETS) {
      const code = snippet.code(PARAMS);
      expect(code).toContain(PARAMS.cookie);
      expect(code).toContain(PARAMS.model);
    }
  });

  it("points every gateway client at the gateway", () => {
    for (const snippet of SNIPPETS.filter(
      (entry) => entry.target === "gateway"
    )) {
      expect(snippet.code(PARAMS)).toContain(PARAMS.proxyUrl);
    }
  });

  it("keeps the AI SDK on the cookie, because it calls AI Pass itself", () => {
    const upstream = SNIPPETS.filter((entry) => entry.target === "upstream");
    expect(upstream.map((entry) => entry.id)).toEqual(["ai-sdk"]);
    expect(upstream[0]?.code(PARAMS)).not.toContain(PARAMS.proxyUrl);
  });

  it("configures Codex for the Responses protocol and the env key it reads", () => {
    const code = byId("codex").code(PARAMS);

    expect(code).toContain('wire_api = "responses"');
    expect(code).toContain('base_url = "https://gateway.example/v1"');
    expect(code).toContain('env_key = "AIPASS_COOKIE"');
    expect(code.indexOf("export AIPASS_COOKIE")).toBeLessThan(
      code.indexOf("model_provider")
    );
    expect(byId("codex").filename).toBe("~/.codex/config.toml");
  });

  it("reads as steps, with exactly one carrying the code", () => {
    for (const snippet of SNIPPETS) {
      expect(snippet.steps.length).toBeGreaterThan(0);
      expect(snippet.steps.filter((step) => step.code === true)).toHaveLength(
        1
      );
      expect(snippet.summary.length).toBeGreaterThan(0);
    }
  });

  it("asks only for what a client calls", () => {
    expect(CLIENT_SCOPE).toBe("chat models");
  });

  it("gives every snippet a grammar the block can paint", () => {
    for (const snippet of SNIPPETS) {
      expect(["bash", "json", "toml", "tsx"]).toContain(snippet.language);
    }
  });
});
