import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { appendAllowRule, dedupeRules, loadConfig, projectConfigPath } from "./config.js";

let tempDir: string;
let projectDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "perm-gate-"));
  projectDir = join(tempDir, "proj");
  await mkdir(projectDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  test("returns defaults when no config files exist", () => {
    const config = loadConfig(projectDir);
    expect(config.gate).toEqual(["bash", "write", "edit"]);
    expect(config.allow).toEqual([]);
    expect(config.deny).toEqual([]);
  });

  test("loads project config", async () => {
    await mkdir(join(projectDir, ".pi"), { recursive: true });
    await writeFile(
      projectConfigPath(projectDir),
      JSON.stringify({
        allow: [{ tool: "bash", match: "prog:git" }],
        deny: [{ tool: "bash", match: "prog:sudo" }],
      }),
    );

    const config = loadConfig(projectDir);
    expect(config.allow).toEqual([{ tool: "bash", match: "prog:git" }]);
    expect(config.deny).toEqual([{ tool: "bash", match: "prog:sudo" }]);
  });
});

describe("appendAllowRule", () => {
  test("creates project file and appends rule", async () => {
    appendAllowRule(projectDir, { tool: "bash", match: "prog:npm" });

    const raw = await readFile(projectConfigPath(projectDir), "utf8");
    const parsed = JSON.parse(raw) as { allow: { tool: string; match: string }[] };
    expect(parsed.allow).toEqual([{ tool: "bash", match: "prog:npm" }]);
  });

  test("dedupes on append", async () => {
    const rule = { tool: "bash", match: "prog:npm" };
    appendAllowRule(projectDir, rule);
    appendAllowRule(projectDir, rule);

    const raw = await readFile(projectConfigPath(projectDir), "utf8");
    const parsed = JSON.parse(raw) as { allow: unknown[] };
    expect(parsed.allow).toHaveLength(1);
  });
});

describe("dedupeRules", () => {
  test("removes duplicate rules", () => {
    const rules = dedupeRules([
      { tool: "bash", match: "prog:git" },
      { tool: "bash", match: "prog:git" },
      { tool: "write", match: "a.ts" },
    ]);
    expect(rules).toHaveLength(2);
  });
});
