import { platform as currentPlatform } from "node:os";
import { extname } from "node:path";

const appServerArgs = ["app-server", "--listen", "stdio://"] as const;
const windowsShellExtensions = new Set([".bat", ".cmd"]);

type CodexSpawnPlatform = NodeJS.Platform;

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

export function resolveCodexAppServerSpawn(
  input: CodexAppServerSpawnInput = {},
): CodexAppServerSpawn {
  const platform = input.platform ?? currentPlatform();
  const command = resolveCodexBinary(input.env ?? process.env);
  const isWindows = platform === "win32";

  return {
    command,
    args: [...appServerArgs],
    shell: isWindows && shouldUseWindowsShell(command),
    windowsHide: isWindows,
  };
}

function resolveCodexBinary(env: NodeJS.ProcessEnv) {
  return env.CODEX_BIN?.trim() || "codex";
}

function shouldUseWindowsShell(command: string) {
  const extension = extname(command).toLowerCase();
  return extension === "" || windowsShellExtensions.has(extension);
}
