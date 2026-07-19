import { homedir, platform as currentPlatform } from "node:os";
import { extname, join } from "node:path";

const appServerProxyArgs = ["app-server", "proxy"] as const;
const appServerStdioArgs = ["app-server", "--listen", "stdio://"] as const;
const windowsShellExtensions = new Set([".bat", ".cmd"]);

type CodexSpawnPlatform = NodeJS.Platform;

export type CodexAppServerMode = "proxy" | "socket" | "stdio";

export type CodexAppServerSpawn = {
  readonly args: string[];
  readonly command: string;
  readonly shell: boolean;
  readonly windowsHide: boolean;
};

export type CodexAppServerSpawnInput = {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: CodexSpawnPlatform;
};

export function resolveCodexAppServerMode(
  env: NodeJS.ProcessEnv = process.env,
): CodexAppServerMode {
  const configuredMode = env.CODEX_RELAY_APP_SERVER_MODE?.trim().toLowerCase();
  if (!configuredMode || configuredMode === "stdio") {
    return "stdio";
  }
  if (configuredMode === "proxy" || configuredMode === "socket") {
    return configuredMode;
  }
  throw new Error(
    `Unsupported CODEX_RELAY_APP_SERVER_MODE ${JSON.stringify(configuredMode)}. Expected "stdio", "proxy", or "socket".`,
  );
}

export function resolveCodexAppServerSpawn(
  input: CodexAppServerSpawnInput = {},
): CodexAppServerSpawn {
  const platform = input.platform ?? currentPlatform();
  const command = resolveCodexBinary(input.env ?? process.env);
  const isWindows = platform === "win32";

  return {
    command,
    args: resolveAppServerArgs(input.env ?? process.env),
    shell: isWindows && shouldUseWindowsShell(command),
    windowsHide: isWindows,
  };
}

function resolveAppServerArgs(env: NodeJS.ProcessEnv) {
  const mode = resolveCodexAppServerMode(env);
  const socketPath = env.CODEX_RELAY_APP_SERVER_SOCK?.trim();
  if (mode === "proxy" || (socketPath && mode !== "socket")) {
    const args: string[] = [...appServerProxyArgs];
    if (socketPath) {
      args.push("--sock", socketPath);
    }
    return args;
  }

  return [...appServerStdioArgs];
}

export function resolveCodexSharedAppServerSocketPath(input: CodexAppServerSpawnInput = {}) {
  const platform = input.platform ?? currentPlatform();
  if (platform === "win32") {
    throw new Error("Shared Codex app-server socket mode is not supported on native Windows.");
  }

  const env = input.env ?? process.env;
  return (
    env.CODEX_RELAY_APP_SERVER_SOCK?.trim() ||
    join(
      env.CODEX_HOME?.trim() || join(homedir(), ".codex"),
      "app-server-control",
      "app-server-control.sock",
    )
  );
}

function resolveCodexBinary(env: NodeJS.ProcessEnv) {
  return env.CODEX_BIN?.trim() || "codex";
}

function shouldUseWindowsShell(command: string) {
  const extension = extname(command).toLowerCase();
  return extension === "" || windowsShellExtensions.has(extension);
}
