import { describe, expect, it } from "vitest";

import { resolveCodexAppServerSpawn } from "../src/codex-binary.js";

describe("Codex app-server spawn resolution", () => {
  it("uses a shell for the default npm command on Windows", () => {
    const spawnConfig = resolveCodexAppServerSpawn({
      env: {},
      platform: "win32",
    });

    expect(spawnConfig).toEqual({
      command: "codex",
      args: ["app-server", "--listen", "stdio://"],
      shell: true,
      windowsHide: true,
    });
  });

  it("uses a shell for Windows command shims", () => {
    const spawnConfig = resolveCodexAppServerSpawn({
      env: { CODEX_BIN: "C:\\Users\\leore\\AppData\\Roaming\\npm\\codex.cmd" },
      platform: "win32",
    });

    expect(spawnConfig).toEqual({
      command: "C:\\Users\\leore\\AppData\\Roaming\\npm\\codex.cmd",
      args: ["app-server", "--listen", "stdio://"],
      shell: true,
      windowsHide: true,
    });
  });

  it("spawns executables directly on Windows", () => {
    const spawnConfig = resolveCodexAppServerSpawn({
      env: { CODEX_BIN: "C:\\Program Files\\Codex\\codex.exe" },
      platform: "win32",
    });

    expect(spawnConfig).toEqual({
      command: "C:\\Program Files\\Codex\\codex.exe",
      args: ["app-server", "--listen", "stdio://"],
      shell: false,
      windowsHide: true,
    });
  });

  it("spawns the command directly on POSIX platforms", () => {
    const spawnConfig = resolveCodexAppServerSpawn({
      env: {},
      platform: "linux",
    });

    expect(spawnConfig).toEqual({
      command: "codex",
      args: ["app-server", "--listen", "stdio://"],
      shell: false,
      windowsHide: false,
    });
  });
});
