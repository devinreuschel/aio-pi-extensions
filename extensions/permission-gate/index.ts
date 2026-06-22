import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

import {
  appendAllowRule,
  CONFIG_FILENAME,
  loadConfig,
  projectConfigPath,
  type ResolvedPermissionsConfig,
} from "./config.js";
import {
  deriveRule,
  describeToolCall,
  formatRule,
  isGated,
  matchRule,
  ruleKey,
  type PermissionRule,
} from "./rules.js";

const POPUP_CHOICES = [
  "Allow once",
  "Allow for session",
  "Allow always",
  "Skip",
  "Stop",
] as const;

let enabled = true;
let activeConfig: ResolvedPermissionsConfig | null = null;
const sessionAllowRules: PermissionRule[] = [];

function block(reason: string, tool: string, detail: string) {
  return { block: true, reason: `${reason}\nTool: ${tool}\n${detail}` };
}

function addSessionRule(rule: PermissionRule): void {
  const key = ruleKey(rule);
  if (sessionAllowRules.some((r) => ruleKey(r) === key)) return;
  sessionAllowRules.push(rule);
}

function formatPolicy(config: ResolvedPermissionsConfig, cwd: string): string {
  const fmt = (rules: PermissionRule[]) =>
    rules.length ? rules.map(formatRule).join("; ") : "(none)";
  return [
    "permission-gate",
    `  project: ${projectConfigPath(cwd)}`,
    `  global:  ${join(getAgentDir(), CONFIG_FILENAME)}`,
    "",
    `  enabled: ${enabled}`,
    `  gate:    ${config.gate.join(", ")}`,
    `  allow:   ${fmt(config.allow)}`,
    `  deny:    ${fmt(config.deny)}`,
    `  session: ${fmt(sessionAllowRules)}`,
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerFlag("no-permissions", {
    description: "Disable permission prompts for this session",
    type: "boolean",
    default: false,
  });

  pi.on("session_start", async (_event, ctx) => {
    sessionAllowRules.length = 0;
    activeConfig = loadConfig(ctx.cwd);

    if (pi.getFlag("no-permissions") === true || process.env.PI_PERMISSIONS_DISABLE === "1") {
      enabled = false;
      ctx.ui.setStatus("permission-gate", undefined);
      ctx.ui.notify("Permission gate disabled", "warning");
      return;
    }

    enabled = true;
    ctx.ui.setStatus("permission-gate", ctx.ui.theme.fg("accent", "🔐 permissions"));
  });

  pi.on("session_shutdown", async () => {
    sessionAllowRules.length = 0;
    activeConfig = null;
    enabled = true;
  });

  pi.registerCommand("permissions", {
    description: "Show permission-gate configuration",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatPolicy(activeConfig ?? loadConfig(ctx.cwd), ctx.cwd), "info");
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!enabled || !activeConfig) return;
    if (!isGated(event.toolName, activeConfig.gate)) return;

    const input = event.input as Record<string, unknown>;
    const tool = event.toolName;
    const detail = describeToolCall(tool, input);

    const deny = activeConfig.deny.find((r) => matchRule(r, tool, input, ctx.cwd));
    if (deny) return block(`Permission denied by rule: ${formatRule(deny)}`, tool, detail);

    const allowed = [...activeConfig.allow, ...sessionAllowRules].some((r) =>
      matchRule(r, tool, input, ctx.cwd),
    );
    if (allowed) return;

    if (!ctx.hasUI) return block(`Permission required (no UI): ${tool}`, tool, detail);

    const prompt = detail.length > 200 ? `${detail.slice(0, 197)}...` : detail;
    const choice = await ctx.ui.select(`Allow ${tool}?\n${prompt}`, [...POPUP_CHOICES]);

    if (choice === "Allow once") return;

    const derived = deriveRule(tool, input, ctx.cwd);
    if (choice === "Allow for session") {
      addSessionRule(derived);
      return;
    }
    if (choice === "Allow always") {
      appendAllowRule(ctx.cwd, derived);
      activeConfig.allow.push(derived);
      addSessionRule(derived);
      ctx.ui.notify(`Allowed always: ${formatRule(derived)}`, "info");
      return;
    }
    if (choice === "Stop") {
      ctx.abort();
      return block("Permission stopped by user", tool, detail);
    }

    return block("Permission skipped by user", tool, detail);
  });
}
