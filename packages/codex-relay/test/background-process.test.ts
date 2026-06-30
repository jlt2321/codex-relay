import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readRunningRelayPid } from "../src/background-process.js";

describe("background relay pid detection", () => {
  it("ignores a live pid when the process is not codex-relay", async () => {
    const pidPath = await writePidFile("12965");

    const pid = await readRunningRelayPid(pidPath, {
      commandReader: async () => "/Applications/Visual Studio Code.app/Contents/MacOS/Code Helper",
      isProcessAlive: () => true,
    });

    expect(pid).toBeUndefined();
  });

  it("returns a live pid when the process command belongs to codex-relay", async () => {
    const pidPath = await writePidFile("77542");

    const pid = await readRunningRelayPid(pidPath, {
      commandReader: async () =>
        "/Users/gronxb/.local/bin/node --import loader.mjs src/cli.ts --dangerously-auto-approve",
      isProcessAlive: () => true,
    });

    expect(pid).toBe(77542);
  });
});

async function writePidFile(value: string) {
  const directory = await mkdtemp(join(tmpdir(), "codex-relay-pid-"));
  const pidPath = join(directory, "server.pid");
  await writeFile(pidPath, value);
  return pidPath;
}
