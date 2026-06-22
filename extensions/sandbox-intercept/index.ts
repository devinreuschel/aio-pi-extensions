import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { SandboxManager, type SandboxRuntimeConfig } from "@carderne/sandbox-runtime";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type BashOperations,
  createBashToolDefinition,
  getAgentDir,
  getShellConfig,
  isToolCallEventType,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

import { CONFIG_FILENAME, loadConfig, type ResolvedSandboxConfig } from "./config.js";

let sandboxEnabled = false;
let sandboxInitialized = false;
let activeConfig: ResolvedSandboxConfig | null = null;

const sessionAllowedDomains: string[] = [];
const sessionAllowedReadPaths: string[] = [];
const sessionAllowedWritePaths: string[] = [];

function expandPath(filePath: string): string {
  const expanded = filePath.replace(/^~(?=$|\/)/, homedir());
  return resolve(expanded);
}

function canonicalizePath(filePath: string, cwd: string): string {
  const abs = expandPath(filePath.startsWith(".") ? join(cwd, filePath) : filePath);
  try {
    return realpathSync.native(abs);
  } catch {
    return abs;
  }
}

function matchesPattern(filePath: string, patterns: string[], cwd: string): boolean {
  const abs = canonicalizePath(filePath, cwd);
  return patterns.some((p) => {
    const absP = p.includes("*") ? expandPath(p) : canonicalizePath(p, cwd);
    if (p.includes("*")) {
      const escaped = absP.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`).test(abs);
    }
    const sep = absP.endsWith("/") ? "" : "/";
    return abs === absP || abs.startsWith(absP + sep);
  });
}

function toSandboxRuntimeConfig(config: ResolvedSandboxConfig): SandboxRuntimeConfig {
  return {
    network: {
      allowedDomains: [...config.network.allowedDomains, ...sessionAllowedDomains],
      deniedDomains: [],
    },
    filesystem: {
      denyRead: config.filesystem.denyRead,
      allowRead: [...config.filesystem.allowRead, ...sessionAllowedReadPaths],
      allowWrite: [...config.filesystem.allowWrite, ...sessionAllowedWritePaths],
      denyWrite: config.filesystem.denyWrite,
    },
    enableWeakerNetworkIsolation: true,
  };
}

async function initSandbox(config: ResolvedSandboxConfig): Promise<void> {
  await SandboxManager.initialize(toSandboxRuntimeConfig(config));
  sandboxInitialized = true;
}

function createSandboxedBashOps(shellPath?: string): BashOperations {
  return {
    async exec(command, cwd, { onData, signal, timeout, env }) {
      if (!existsSync(cwd)) throw new Error(`Working directory does not exist: ${cwd}`);
      const { shell, args } = getShellConfig(shellPath);
      const wrappedCommand = await SandboxManager.wrapWithSandbox(command, shell);

      return new Promise((resolvePromise, reject) => {
        const child = spawn(shell, [...args, wrappedCommand], {
          cwd,
          env,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let timedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;
        if (timeout && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            if (child.pid) {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch {
                child.kill("SIGKILL");
              }
            }
          }, timeout * 1000);
        }

        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);
        child.on("error", (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(err);
        });

        const onAbort = () => {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          }
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          signal?.removeEventListener("abort", onAbort);
          if (signal?.aborted) reject(new Error("aborted"));
          else if (timedOut) reject(new Error(`timeout:${timeout}`));
          else resolvePromise({ exitCode: code });
        });
      });
    },
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerFlag("no-sandbox", {
    description: "Disable OS-level sandboxing",
    type: "boolean",
    default: false,
  });

  const localCwd = process.cwd();
  const userShellPath = SettingsManager.create(localCwd).getShellPath();
  const localBash = createBashToolDefinition(localCwd, { shellPath: userShellPath });

  pi.registerTool({
    ...localBash,
    label: "bash (sandboxed)",
    async execute(id, params, signal, onUpdate, ctx) {
      const run = () => {
        if (!sandboxEnabled || !sandboxInitialized) {
          return localBash.execute(id, params, signal, onUpdate, ctx);
        }
        const sandboxed = createBashToolDefinition(localCwd, {
          operations: createSandboxedBashOps(userShellPath),
          shellPath: userShellPath,
        });
        return sandboxed.execute(id, params, signal, onUpdate, ctx);
      };
      return run();
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!sandboxEnabled || !activeConfig) return;

    if (isToolCallEventType("read", event)) {
      const allowRead = [...activeConfig.filesystem.allowRead, ...sessionAllowedReadPaths];
      const denyRead = activeConfig.filesystem.denyRead;
      const path = event.input.path;
      if (
        matchesPattern(path, denyRead, ctx.cwd) &&
        !matchesPattern(path, allowRead, ctx.cwd)
      ) {
        return { block: true, reason: `Sandbox: read denied for "${path}"` };
      }
    }

    if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
      const path = (event.input as { path: string }).path;
      const allowWrite = [...activeConfig.filesystem.allowWrite, ...sessionAllowedWritePaths];
      const denyWrite = activeConfig.filesystem.denyWrite;
      if (matchesPattern(path, denyWrite, ctx.cwd)) {
        return { block: true, reason: `Sandbox: write denied for "${path}" (denyWrite)` };
      }
      if (!matchesPattern(path, allowWrite, ctx.cwd)) {
        if (ctx.hasUI) {
          const ok = await ctx.ui.confirm(
            "Write blocked",
            `Allow write to "${path}" for this session?`,
          );
          if (!ok) return { block: true, reason: `Sandbox: write denied for "${path}"` };
          sessionAllowedWritePaths.push(canonicalizePath(path, ctx.cwd));
          await initSandbox(activeConfig);
        } else {
          return { block: true, reason: `Sandbox: write denied for "${path}"` };
        }
      }
    }
  });

  pi.on("user_bash", async (_event, ctx) => {
    if (!sandboxEnabled || !sandboxInitialized) return;
    return { operations: createSandboxedBashOps(userShellPath) };
  });

  pi.on("session_start", async (_event, ctx) => {
    if (pi.getFlag("no-sandbox") || process.env.SANDBOX_INTERCEPT_DISABLE === "1") {
      sandboxEnabled = false;
      ctx.ui.notify("Sandbox disabled", "warning");
      return;
    }

    const platform = process.platform;
    if (platform !== "darwin" && platform !== "linux") {
      sandboxEnabled = false;
      ctx.ui.notify(`Sandbox not supported on ${platform}`, "warning");
      return;
    }

    try {
      activeConfig = loadConfig(ctx.cwd);
      await initSandbox(activeConfig);
      sandboxEnabled = true;
      ctx.ui.setStatus(
        "sandbox-intercept",
        ctx.ui.theme.fg("accent", "🔒 sandbox active"),
      );
    } catch (err) {
      sandboxEnabled = false;
      ctx.ui.notify(
        `Sandbox init failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    if (sandboxInitialized) {
      try {
        await SandboxManager.reset();
      } catch {
        /* ignore */
      }
    }
    sandboxInitialized = false;
    sandboxEnabled = false;
  });

  pi.registerCommand("sandbox", {
    description: "Show sandbox-intercept configuration",
    handler: async (_args, ctx) => {
      const config = loadConfig(ctx.cwd);
      const lines = [
        "sandbox-intercept",
        `  project: ${join(ctx.cwd, ".pi", CONFIG_FILENAME)}`,
        `  global:  ${join(getAgentDir(), CONFIG_FILENAME)}`,
        "",
        `  enabled: ${sandboxEnabled}`,
        `  allow write: ${config.filesystem.allowWrite.join(", ")}`,
        `  deny write:  ${config.filesystem.denyWrite.join(", ")}`,
        `  allow read:  ${config.filesystem.allowRead.join(", ")}`,
        `  deny read:   ${config.filesystem.denyRead.join(", ")}`,
        `  network:     ${config.network.allowedDomains.join(", ") || "(default-deny)"}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
