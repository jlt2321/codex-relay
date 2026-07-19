import { describe, expect, it } from "vitest";

import {
  resolveCodexAppServerMode,
  resolveCodexAppServerSpawn,
  resolveCodexSharedAppServerSocketPath,
} from "../src/codex-binary.js";

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

  it("can explicitly use the shared proxy app-server mode", () => {
    const spawnConfig = resolveCodexAppServerSpawn({
      env: { CODEX_RELAY_APP_SERVER_MODE: "proxy" },
      platform: "darwin",
    });

    expect(spawnConfig).toEqual({
      command: "codex",
      args: ["app-server", "proxy"],
      shell: false,
      windowsHide: false,
    });
  });

  it("passes an explicit app-server proxy socket path", () => {
    const spawnConfig = resolveCodexAppServerSpawn({
      env: { CODEX_RELAY_APP_SERVER_SOCK: "/tmp/codex-app-server.sock" },
      platform: "darwin",
    });

    expect(spawnConfig).toEqual({
      command: "codex",
      args: ["app-server", "proxy", "--sock", "/tmp/codex-app-server.sock"],
      shell: false,
      windowsHide: false,
    });
  });

  it("recognizes explicit Unix socket attach mode", () => {
    expect(resolveCodexAppServerMode({ CODEX_RELAY_APP_SERVER_MODE: "socket" })).toBe("socket");
  });

  it("rejects unknown app-server modes", () => {
    expect(() => resolveCodexAppServerMode({ CODEX_RELAY_APP_SERVER_MODE: "shared" })).toThrow(
      'Expected "stdio", "proxy", or "socket"',
    );
  });

  it("resolves the default shared Unix socket under CODEX_HOME", () => {
    expect(
      resolveCodexSharedAppServerSocketPath({
        env: { CODEX_HOME: "/tmp/codex-home" },
        platform: "darwin",
      }),
    ).toBe("/tmp/codex-home/app-server-control/app-server-control.sock");
  });

  it("accepts an explicit shared Unix socket path", () => {
    expect(
      resolveCodexSharedAppServerSocketPath({
        env: { CODEX_RELAY_APP_SERVER_SOCK: "/tmp/shared.sock" },
        platform: "linux",
      }),
    ).toBe("/tmp/shared.sock");
  });

  it("rejects native Windows shared socket mode", () => {
    expect(() =>
      resolveCodexSharedAppServerSocketPath({
        env: {},
        platform: "win32",
      }),
    ).toThrow("not supported on native Windows");
  });
});
