import { describe, expect, it } from "vitest";

import { applyServerCliEnvironment } from "../src/cli-options.js";

describe("Codex Relay server CLI options", () => {
  it("enables attach-only shared app-server mode explicitly", () => {
    const env: NodeJS.ProcessEnv = {};

    applyServerCliEnvironment({ sharedAppServer: true }, env);

    expect(env.CODEX_RELAY_APP_SERVER_MODE).toBe("socket");
  });

  it("does not change the configured app-server mode without the flag", () => {
    const env: NodeJS.ProcessEnv = { CODEX_RELAY_APP_SERVER_MODE: "proxy" };

    applyServerCliEnvironment({}, env);

    expect(env.CODEX_RELAY_APP_SERVER_MODE).toBe("proxy");
  });

  it("preserves the existing debug and auto-approve option mappings", () => {
    const env: NodeJS.ProcessEnv = {};

    applyServerCliEnvironment({ dangerouslyAutoApprove: true, debug: true }, env);

    expect(env.CODEX_RELAY_DEBUG).toBe("1");
    expect(env.CODEX_RELAY_DANGEROUSLY_AUTO_APPROVE).toBe("1");
  });
});
