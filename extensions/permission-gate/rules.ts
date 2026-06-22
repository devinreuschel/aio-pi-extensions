import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface PermissionRule {
  tool: string;
  match?: string;
}

export const DEFAULT_GATE = ["bash", "write", "edit"] as const;

const SHELL_OPERATORS = /&&|\|\||;|\||\$\(|`/;

export function hasShellOperators(command: string): boolean {
  return SHELL_OPERATORS.test(command);
}

export function firstProgram(command: string): string | undefined {
  const trimmed = command.trim();
  if (!trimmed) return undefined;
  const m = trimmed.match(/^([^\s&|;`$()]+)/);
  return m?.[1];
}

export function expandPath(filePath: string): string {
  return resolve(filePath.replace(/^~(?=$|\/)/, homedir()));
}

export function canonicalizePath(filePath: string, cwd: string): string {
  const abs = expandPath(filePath.startsWith(".") ? join(cwd, filePath) : filePath);
  try {
    return realpathSync.native(abs);
  } catch {
    return abs;
  }
}

export function isGated(toolName: string, gate: readonly string[]): boolean {
  return gate.includes(toolName);
}

export function formatRule(rule: PermissionRule): string {
  if (!rule.match) return rule.tool;
  return `${rule.tool} (${rule.match})`;
}

export function ruleKey(rule: PermissionRule): string {
  return `${rule.tool}\0${rule.match ?? "*"}`;
}

function toolPath(input: Record<string, unknown>): string {
  return String((input as { path?: string }).path ?? "");
}

function testRe(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

export function deriveRule(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
): PermissionRule {
  if (toolName === "bash") {
    const command = String(input.command ?? "").trim();
    if (!hasShellOperators(command)) {
      const prog = firstProgram(command);
      if (prog) return { tool: "bash", match: `prog:${prog}` };
    }
    return { tool: "bash", match: command };
  }
  return { tool: toolName, match: canonicalizePath(toolPath(input), cwd) };
}

function globMatch(value: string, pattern: string, cwd: string): boolean {
  const abs = canonicalizePath(value, cwd);
  const absP = pattern.includes("*") ? expandPath(pattern) : canonicalizePath(pattern, cwd);
  if (pattern.includes("*")) {
    const escaped = absP.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(abs);
  }
  const sep = absP.endsWith("/") ? "" : "/";
  return abs === absP || abs.startsWith(absP + sep);
}

function matchBash(command: string, match: string): boolean {
  if (match.startsWith("prog:")) return firstProgram(command) === match.slice(5);
  if (match.startsWith("prefix:")) return command.startsWith(match.slice(7));
  if (match.startsWith("re:")) return testRe(match.slice(3), command);
  return command.trim() === match;
}

function matchPath(path: string, match: string, cwd: string): boolean {
  const abs = canonicalizePath(path, cwd);
  if (match.startsWith("prefix:")) {
    const prefix = match.slice(7);
    if (prefix.includes("/") || prefix.startsWith(".") || prefix.startsWith("~")) {
      return abs.startsWith(canonicalizePath(prefix, cwd));
    }
    return path.startsWith(prefix) || abs.startsWith(prefix);
  }
  if (match.startsWith("re:")) {
    const re = match.slice(3);
    return testRe(re, path) || testRe(re, abs);
  }
  if (match.includes("*")) return globMatch(path, match, cwd);
  return abs === canonicalizePath(match, cwd) || path === match;
}

export function matchRule(
  rule: PermissionRule,
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
): boolean {
  if (rule.tool !== toolName) return false;
  if (rule.match === undefined) return true;
  if (toolName === "bash") return matchBash(String(input.command ?? ""), rule.match);
  return matchPath(toolPath(input), rule.match, cwd);
}

export function describeToolCall(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "bash") return String(input.command ?? "");
  return toolPath(input);
}
