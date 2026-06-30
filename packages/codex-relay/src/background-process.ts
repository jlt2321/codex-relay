import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ProcessCommandReader = (pid: number) => Promise<string | undefined>;
type ProcessAliveChecker = (pid: number) => boolean;

type ReadRunningRelayPidOptions = {
  readonly commandReader?: ProcessCommandReader;
  readonly isProcessAlive?: ProcessAliveChecker;
};

export async function readRunningRelayPid(
  pidPath: string,
  options: ReadRunningRelayPidOptions = {},
) {
  const value = await readFile(pidPath, "utf8").catch(() => undefined);
  const pid = value ? Number(value.trim()) : NaN;
  if (!Number.isInteger(pid) || pid <= 0) {
    return undefined;
  }

  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  if (!isProcessAlive(pid)) {
    return undefined;
  }

  const commandReader = options.commandReader ?? readProcessCommand;
  const command = await commandReader(pid);
  return command && isRelayProcessCommand(command) ? pid : undefined;
}

function defaultIsProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readProcessCommand(pid: number) {
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function isRelayProcessCommand(command: string) {
  const normalized = command.replaceAll("\\", "/");
  return (
    normalized.includes("codex-relay") ||
    normalized.includes("/src/cli.ts") ||
    normalized.includes(" src/cli.ts")
  );
}
