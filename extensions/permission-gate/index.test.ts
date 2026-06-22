import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createMockExtensionAPI } from "@aio-pi/shared/testing";

import { projectConfigPath } from "./config.js";
import register from "./index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "perm-gate-idx-"));
});

afterEach(() => {
  delete process.env.PI_PERMISSIONS_DISABLE;
});

function createMockContext(cwd: string, uiOverrides: Partial<ExtensionContext["ui"]> = {}): ExtensionContext {
  const theme = { fg: (_: string, text: string) => text };
  return {
    ui: {
      notify: () => {},
      setStatus: () => {},
      theme,
      select: async () => undefined,
      ...uiOverrides,
    } as unknown as ExtensionContext["ui"],
    mode: "tui",
    hasUI: true,
    cwd,
    sessionManager: {} as ExtensionContext["sessionManager"],
    modelRegistry: {} as ExtensionContext["modelRegistry"],
    model: undefined,
    isIdle: () => true,
    isProjectTrusted: () => true,
    signal: undefined,
    abort: () => {},
    hasPendingMessages: () => false,
    shutdown: () => {},
    getContextUsage: () => undefined,
    compact: () => {},
    getSystemPrompt: () => "",
  };
}

function setup() {
  const mock = createMockExtensionAPI();
  register(mock.api);
  const sessionStart = mock.handlers.find((h) => h.event === "session_start")!.handler;
  const toolCall = mock.handlers.find((h) => h.event === "tool_call")!.handler;
  return { mock, sessionStart, toolCall };
}

async function startSession(
  sessionStart: ReturnType<typeof setup>["sessionStart"],
  cwd: string,
  uiOverrides?: Partial<ExtensionContext["ui"]>,
) {
  const ctx = createMockContext(cwd, uiOverrides);
  await sessionStart({ type: "session_start", reason: "startup" }, ctx);
  return ctx;
}

const bashCall = (command: string, id = "1") => ({
  type: "tool_call" as const,
  toolCallId: id,
  toolName: "bash" as const,
  input: { command },
});

describe("permission-gate", () => {
  test("registers flag, command, and handlers", () => {
    const { mock } = setup();
    expect(mock.flags.some((f) => f.name === "no-permissions")).toBe(true);
    expect(mock.commands.some((c) => c.name === "permissions")).toBe(true);
    expect(mock.handlers.map((h) => h.event)).toEqual(
      expect.arrayContaining(["session_start", "session_shutdown", "tool_call"]),
    );
  });

  test("tool_call passes through read tools", async () => {
    const { sessionStart, toolCall } = setup();
    const ctx = await startSession(sessionStart, tempDir);
    const result = await toolCall(
      { type: "tool_call", toolCallId: "1", toolName: "read", input: { path: "x.ts" } },
      ctx,
    );
    expect(result).toBeUndefined();
  });

  test("tool_call blocks deny rules without prompt", async () => {
    await mkdir(join(tempDir, ".pi"), { recursive: true });
    await writeFile(
      projectConfigPath(tempDir),
      JSON.stringify({ deny: [{ tool: "bash", match: "prog:sudo" }] }),
    );

    const { sessionStart, toolCall } = setup();
    const ctx = await startSession(sessionStart, tempDir);
    const result = await toolCall(bashCall("sudo rm -rf /"), ctx);

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("Permission denied by rule"),
    });
  });

  test("tool_call blocks without UI", async () => {
    const { sessionStart, toolCall } = setup();
    const ctx = await startSession(sessionStart, tempDir);
    ctx.hasUI = false;
    const result = await toolCall(bashCall("npm install"), ctx);
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("Permission required (no UI)"),
    });
  });

  test("tool_call allow once proceeds", async () => {
    const { sessionStart, toolCall } = setup();
    const ctx = await startSession(sessionStart, tempDir, { select: async () => "Allow once" });
    expect(await toolCall(bashCall("npm install"), ctx)).toBeUndefined();
  });

  test("tool_call skip blocks", async () => {
    const { sessionStart, toolCall } = setup();
    const ctx = await startSession(sessionStart, tempDir, { select: async () => "Skip" });
    const result = await toolCall(bashCall("npm install"), ctx);
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("Permission skipped"),
    });
  });

  test("tool_call stop aborts and blocks", async () => {
    const { sessionStart, toolCall } = setup();
    let aborted = false;
    const ctx = await startSession(sessionStart, tempDir, { select: async () => "Stop" });
    ctx.abort = () => {
      aborted = true;
    };
    const result = await toolCall(bashCall("npm install"), ctx);
    expect(aborted).toBe(true);
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("Permission stopped"),
    });
  });

  test("tool_call allow for session then auto-allows matching calls", async () => {
    const { sessionStart, toolCall } = setup();
    let calls = 0;
    const ctx = await startSession(sessionStart, tempDir, {
      select: async () => {
        calls++;
        return calls === 1 ? "Allow for session" : "Skip";
      },
    });

    expect(await toolCall(bashCall("npm install foo"), ctx)).toBeUndefined();
    expect(await toolCall(bashCall("npm install bar", "2"), ctx)).toBeUndefined();
    expect(calls).toBe(1);
  });

  test("disabled via env skips gating", async () => {
    process.env.PI_PERMISSIONS_DISABLE = "1";
    const { sessionStart, toolCall } = setup();
    const ctx = await startSession(sessionStart, tempDir);
    expect(await toolCall(bashCall("rm -rf /"), ctx)).toBeUndefined();
  });

  test("tool_call allow always persists rule", async () => {
    const { sessionStart, toolCall } = setup();
    const notified: string[] = [];
    const ctx = await startSession(sessionStart, tempDir, {
      select: async () => "Allow always",
      notify: (msg) => notified.push(msg),
    });
    await toolCall(bashCall("make build"), ctx);

    expect(notified.some((m) => m.includes("Allowed always"))).toBe(true);
    const raw = await readFile(projectConfigPath(tempDir), "utf8");
    expect(raw).toContain("prog:make");
  });

  test("/permissions shows policy", async () => {
    const { mock, sessionStart } = setup();
    const notified: string[] = [];
    const ctx = await startSession(sessionStart, tempDir, { notify: (msg) => notified.push(msg) });

    const cmd = mock.commands.find((c) => c.name === "permissions")!;
    await (cmd.options as { handler: (args: string, ctx: ExtensionContext) => Promise<void> }).handler(
      "",
      ctx,
    );

    expect(notified[0]).toContain("permission-gate");
    expect(notified[0]).toContain("gate:");
  });
});
