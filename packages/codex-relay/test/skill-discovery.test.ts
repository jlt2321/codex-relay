import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import { listAvailableSkills } from "../src/skill-discovery.js";

describe("skill discovery", () => {
  it("lists workspace skills from symlinked skill directories", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-workspace-"));
    const vendorPath = await mkdtemp(join(tmpdir(), "codex-relay-vendor-skills-"));
    const vendorSkillPath = join(vendorPath, "marimo-notebook");
    const workspaceSkillsPath = join(workspacePath, ".agents", "skills");
    const workspaceSkillLink = join(workspaceSkillsPath, "marimo-notebook");
    await mkdir(vendorSkillPath, { recursive: true });
    await mkdir(workspaceSkillsPath, { recursive: true });
    await writeSkill(vendorSkillPath, [
      "---",
      "name: marimo-notebook",
      "description: Write marimo notebooks.",
      "---",
      "",
      "# Marimo Notebook",
      "",
    ]);
    await symlink(vendorSkillPath, workspaceSkillLink, "dir");

    const skills = await listAvailableSkills({ workspacePath });

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "marimo-notebook",
          displayName: "Marimo Notebook",
          description: "Write marimo notebooks.",
          path: join(workspaceSkillLink, "SKILL.md"),
          source: "workspace",
          sourceLabel: basename(workspacePath),
        }),
      ]),
    );
  });

  it("parses folded descriptions and ignores headings inside code fences", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-workspace-"));
    const skillPath = join(workspacePath, ".agents", "skills", "marimo-pair");
    await mkdir(skillPath, { recursive: true });
    await writeSkill(skillPath, [
      "---",
      "name: marimo-pair",
      "description: >-",
      "  Drive a live marimo notebook as a workspace.",
      "  Inspect live notebook state.",
      "---",
      "",
      "Introductory text without a top-level heading.",
      "",
      "```python",
      "# Public definitions: values, total, i, value, mean",
      "values = [1, 2, 3]",
      "```",
      "",
    ]);

    const skills = await listAvailableSkills({ workspacePath });

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "marimo-pair",
          displayName: "Marimo Pair",
          description: "Drive a live marimo notebook as a workspace. Inspect live notebook state.",
        }),
      ]),
    );
  });

  it("deduplicates repeated plugin cache skills by logical skill identity", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-workspace-"));
    const homePath = await mkdtemp(join(tmpdir(), "codex-relay-home-"));
    const codexHome = join(homePath, ".codex");
    const pluginSkillPaths = [
      join(codexHome, "plugins", "cache", "omo", "4.13.0", "skills", "visual-qa"),
      join(codexHome, "plugins", "cache", "omo-copy", "4.13.0", "skills", "visual-qa"),
    ];
    for (const [index, skillPath] of pluginSkillPaths.entries()) {
      await mkdir(skillPath, { recursive: true });
      await writeSkill(skillPath, [
        "---",
        "name: visual-qa",
        `description: Rigorous visual QA for any UI you built or changed.${index === 0 ? "" : " Updated cache copy."}`,
        "---",
        "",
        `# Visual QA - Dual-Oracle Web and TUI Visual Verification${index === 0 ? "" : " v2"}`,
        "",
      ]);
    }

    const skills = await listAvailableSkills({ codexHome, homePath, workspacePath });
    const visualQaSkills = skills.filter((skill) => skill.name === "visual-qa");

    expect(visualQaSkills).toHaveLength(1);
    expect(visualQaSkills[0]).toMatchObject({
      name: "visual-qa",
      displayName: "Visual QA - Dual-Oracle Web and TUI Visual Verification",
      description: "Rigorous visual QA for any UI you built or changed.",
      source: "plugin",
      sourceLabel: "plugin",
    });
  });
});

function writeSkill(directory: string, lines: string[]) {
  return writeFile(join(directory, "SKILL.md"), lines.join("\n"));
}
