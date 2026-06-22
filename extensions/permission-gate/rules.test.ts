import { describe, expect, test } from "bun:test";

import {
  deriveRule,
  firstProgram,
  formatRule,
  hasShellOperators,
  isGated,
  matchRule,
  ruleKey,
} from "./rules.js";

describe("firstProgram", () => {
  test("extracts first token", () => {
    expect(firstProgram("git status")).toBe("git");
    expect(firstProgram("  npm run test")).toBe("npm");
  });
});

describe("hasShellOperators", () => {
  test("detects compound commands", () => {
    expect(hasShellOperators("a && b")).toBe(true);
    expect(hasShellOperators("echo hi | wc")).toBe(true);
    expect(hasShellOperators("git status")).toBe(false);
  });
});

describe("deriveRule", () => {
  test("derives prog rule for simple bash", () => {
    expect(deriveRule("bash", { command: "git status" }, "/tmp")).toEqual({
      tool: "bash",
      match: "prog:git",
    });
  });

  test("derives exact command for compound bash", () => {
    expect(deriveRule("bash", { command: "git status && npm test" }, "/tmp")).toEqual({
      tool: "bash",
      match: "git status && npm test",
    });
  });

  test("derives canonical path for write", () => {
    const rule = deriveRule("write", { path: "./foo.txt" }, "/tmp/proj");
    expect(rule.tool).toBe("write");
    expect(rule.match).toContain("foo.txt");
  });
});

describe("matchRule", () => {
  test("matches prog prefix and exact bash", () => {
    expect(matchRule({ tool: "bash", match: "prog:git" }, "bash", { command: "git log" }, "/tmp")).toBe(
      true,
    );
    expect(
      matchRule({ tool: "bash", match: "git status" }, "bash", { command: "git status" }, "/tmp"),
    ).toBe(true);
  });

  test("matches prefix and regex", () => {
    expect(
      matchRule({ tool: "bash", match: "prefix:npm run " }, "bash", { command: "npm run test" }, "/tmp"),
    ).toBe(true);
    expect(
      matchRule({ tool: "bash", match: "re:rm\\s+-rf" }, "bash", { command: "rm -rf /" }, "/tmp"),
    ).toBe(true);
  });

  test("matches tool-wide allow", () => {
    expect(matchRule({ tool: "bash" }, "bash", { command: "anything" }, "/tmp")).toBe(true);
    expect(matchRule({ tool: "bash" }, "write", { path: "x" }, "/tmp")).toBe(false);
  });

  test("matches path glob for write", () => {
    const cwd = process.cwd();
    expect(
      matchRule({ tool: "write", match: "src/**" }, "write", { path: "src/a/b.ts" }, cwd),
    ).toBe(true);
  });
});

describe("isGated", () => {
  test("gates default tools", () => {
    expect(isGated("bash", ["bash", "write", "edit"])).toBe(true);
    expect(isGated("read", ["bash", "write", "edit"])).toBe(false);
  });
});

describe("formatRule", () => {
  test("formats with and without match", () => {
    expect(formatRule({ tool: "bash" })).toBe("bash");
    expect(formatRule({ tool: "bash", match: "prog:git" })).toBe("bash (prog:git)");
  });
});

describe("ruleKey", () => {
  test("dedupes equivalent rules", () => {
    const a = ruleKey({ tool: "bash", match: "prog:git" });
    expect(a).toBe(ruleKey({ tool: "bash", match: "prog:git" }));
    expect(a).not.toBe(ruleKey({ tool: "bash", match: "prog:npm" }));
  });
});
