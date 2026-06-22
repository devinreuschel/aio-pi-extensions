import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_FILENAME = "sandbox.json";

export const PROVIDER_DOMAINS: Record<string, string[]> = {
  "github-copilot": [
    "*.githubcopilot.com",
    "api.github.com",
    "copilot-proxy.githubusercontent.com",
  ],
  gemini: [
    "generativelanguage.googleapis.com",
    "oauth2.googleapis.com",
    "www.googleapis.com",
  ],
  openai: ["api.openai.com"],
  anthropic: ["api.anthropic.com"],
  ollama: ["localhost", "127.0.0.1"],
  github: ["github.com", "*.github.com", "*.githubusercontent.com"],
  openrouter: ["api.openrouter.ai"],
  "llama.cpp": ["localhost", "127.0.0.1"],
};

export interface FilesystemConfig {
  denyRead?: string[];
  allowRead?: string[];
  allowWrite?: string[];
  denyWrite?: string[];
}

export interface NetworkConfig {
  providers?: string[];
  allowedDomains?: string[];
}

export interface SandboxConfigFile {
  network?: NetworkConfig;
  filesystem?: FilesystemConfig;
}

export interface ResolvedSandboxConfig {
  network: { allowedDomains: string[] };
  filesystem: Required<FilesystemConfig>;
}

const DEFAULT_FILESYSTEM: Required<FilesystemConfig> = {
  denyRead: ["/Users", "/home"],
  allowRead: [".", "~/.config", "~/.local", "Library"],
  allowWrite: [".", "/tmp"],
  denyWrite: [".env", ".env.*", "*.pem", "*.key"],
};

function readJson(path: string): Partial<SandboxConfigFile> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<SandboxConfigFile>;
  } catch (err) {
    throw new Error(`Failed to parse ${path}: ${err instanceof Error ? err.message : err}`);
  }
}

function mergeConfig(base: SandboxConfigFile, over: Partial<SandboxConfigFile>): SandboxConfigFile {
  return {
    ...base,
    ...over,
    network: { ...base.network, ...over.network },
    filesystem: { ...base.filesystem, ...over.filesystem },
  };
}

function resolveAllowedDomains(network: NetworkConfig | undefined): string[] {
  const domains = new Set<string>();
  for (const provider of network?.providers ?? []) {
    const list = PROVIDER_DOMAINS[provider];
    if (!list) {
      throw new Error(
        `Unknown provider "${provider}". Known: ${Object.keys(PROVIDER_DOMAINS).join(", ")}`,
      );
    }
    for (const d of list) domains.add(d);
  }
  for (const d of network?.allowedDomains ?? []) domains.add(d);
  return [...domains];
}

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".pi", CONFIG_FILENAME);
}

export function userConfigPath(): string {
  return join(homedir(), ".pi", "agent", CONFIG_FILENAME);
}

export function loadConfig(cwd: string): ResolvedSandboxConfig {
  const defaults: SandboxConfigFile = { filesystem: { ...DEFAULT_FILESYSTEM } };
  const user = readJson(userConfigPath());
  const project = readJson(projectConfigPath(cwd));
  const merged = mergeConfig(mergeConfig(defaults, user), project);

  return {
    network: { allowedDomains: resolveAllowedDomains(merged.network) },
    filesystem: {
      denyRead: merged.filesystem?.denyRead ?? DEFAULT_FILESYSTEM.denyRead,
      allowRead: merged.filesystem?.allowRead ?? DEFAULT_FILESYSTEM.allowRead,
      allowWrite: merged.filesystem?.allowWrite ?? DEFAULT_FILESYSTEM.allowWrite,
      denyWrite: merged.filesystem?.denyWrite ?? DEFAULT_FILESYSTEM.denyWrite,
    },
  };
}
