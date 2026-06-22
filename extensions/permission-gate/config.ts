import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { DEFAULT_GATE, type PermissionRule, ruleKey } from "./rules.js";

export const CONFIG_FILENAME = "permissions.json";

export interface PermissionsConfigFile {
  gate?: string[];
  allow?: PermissionRule[];
  deny?: PermissionRule[];
}

export interface ResolvedPermissionsConfig {
  gate: string[];
  allow: PermissionRule[];
  deny: PermissionRule[];
}

const DEFAULTS: ResolvedPermissionsConfig = {
  gate: [...DEFAULT_GATE],
  allow: [],
  deny: [],
};

function readJson(path: string): Partial<PermissionsConfigFile> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<PermissionsConfigFile>;
  } catch (err) {
    throw new Error(`Failed to parse ${path}: ${err instanceof Error ? err.message : err}`);
  }
}

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".pi", CONFIG_FILENAME);
}

export function userConfigPath(): string {
  return join(homedir(), ".pi", "agent", CONFIG_FILENAME);
}

export function loadConfig(cwd: string): ResolvedPermissionsConfig {
  const user = readJson(userConfigPath());
  const project = readJson(projectConfigPath(cwd));

  return {
    gate: project.gate ?? user.gate ?? DEFAULTS.gate,
    allow: dedupeRules([...(user.allow ?? []), ...(project.allow ?? [])]),
    deny: dedupeRules([...(user.deny ?? []), ...(project.deny ?? [])]),
  };
}

export function appendAllowRule(cwd: string, rule: PermissionRule): void {
  const path = projectConfigPath(cwd);
  const existing = readJson(path);
  const allow = existing.allow ?? [];
  const key = ruleKey(rule);
  if (allow.some((r) => ruleKey(r) === key)) return;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ...existing, allow: [...allow, rule] }, null, 2)}\n`, "utf8");
}

export function dedupeRules(rules: PermissionRule[]): PermissionRule[] {
  const seen = new Set<string>();
  const out: PermissionRule[] = [];
  for (const rule of rules) {
    const key = ruleKey(rule);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
  }
  return out;
}
