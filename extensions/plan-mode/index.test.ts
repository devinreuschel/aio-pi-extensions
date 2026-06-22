import { describe, expect, test } from "bun:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createMockExtensionAPI } from "@aio-pi/shared/testing";
import planModeExtension from "./index.js";

function createMockContext(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
  const theme = {
    fg: (_: string, text: string) => text,
    strikethrough: (text: string) => text,
  };
  return {
    ui: {
      notify: () => {},
      setStatus: () => {},
      setWidget: () => {},
      theme,
      select: async () => undefined,
      editor: async () => undefined,
    } as unknown as ExtensionContext["ui"],
    mode: "json",
    hasUI: true,
    cwd: process.cwd(),
    sessionManager: { getEntries: () => [] } as unknown as ExtensionContext["sessionManager"],
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
    ...overrides,
  };
}

describe("plan-mode extension", () => {
  test("registers flag, commands, shortcut, and event handlers", () => {
    const mock = createMockExtensionAPI();
    planModeExtension(mock.api);

    expect(mock.flags).toHaveLength(1);
    expect(mock.flags[0]?.name).toBe("plan");

    expect(mock.commands.map((c) => c.name)).toEqual(["plan", "todos"]);
    expect(mock.shortcuts).toHaveLength(1);

    const events = mock.handlers.map((h) => h.event);
    expect(events).toContain("tool_call");
    expect(events).toContain("before_agent_start");
    expect(events).toContain("session_start");
    expect(events).toContain("agent_end");
  });

  test("/plan toggles to read-only tool subset", async () => {
    const mock = createMockExtensionAPI();
    planModeExtension(mock.api);
    const ctx = createMockContext();
    const before = [...mock.activeTools];

    const planCmd = mock.commands.find((c) => c.name === "plan");
    await (planCmd?.options as { handler: (args: string, ctx: ExtensionContext) => Promise<void> }).handler("", ctx);

    expect(mock.activeTools).not.toEqual(before);
    expect(mock.activeTools).not.toContain("edit");
    expect(mock.activeTools).not.toContain("write");
    expect(mock.activeTools).toContain("read");
  });

  test("/plan again restores saved tools", async () => {
    const mock = createMockExtensionAPI();
    planModeExtension(mock.api);
    const ctx = createMockContext();
    const before = [...mock.activeTools];

    const planCmd = mock.commands.find((c) => c.name === "plan");
    const handler = (planCmd?.options as { handler: (args: string, ctx: ExtensionContext) => Promise<void> }).handler;

    await handler("", ctx);
    await handler("", ctx);

    expect(mock.activeTools).toEqual(before);
  });

  test("tool_call blocks unsafe bash in plan mode", async () => {
    const mock = createMockExtensionAPI();
    planModeExtension(mock.api);
    const ctx = createMockContext();

    const planCmd = mock.commands.find((c) => c.name === "plan");
    await (planCmd?.options as { handler: (args: string, ctx: ExtensionContext) => Promise<void> }).handler("", ctx);

    const toolCall = mock.handlers.find((h) => h.event === "tool_call");
    const result = await toolCall?.handler(
      { toolName: "bash", input: { command: "rm -rf /" } },
      ctx,
    );

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("Plan mode: command blocked"),
    });
  });

  test("tool_call allows safe bash in plan mode", async () => {
    const mock = createMockExtensionAPI();
    planModeExtension(mock.api);
    const ctx = createMockContext();

    const planCmd = mock.commands.find((c) => c.name === "plan");
    await (planCmd?.options as { handler: (args: string, ctx: ExtensionContext) => Promise<void> }).handler("", ctx);

    const toolCall = mock.handlers.find((h) => h.event === "tool_call");
    const result = await toolCall?.handler(
      { toolName: "bash", input: { command: "ls -la" } },
      ctx,
    );

    expect(result).toBeUndefined();
  });

  test("before_agent_start injects plan context when enabled", async () => {
    const mock = createMockExtensionAPI();
    planModeExtension(mock.api);
    const ctx = createMockContext();

    const planCmd = mock.commands.find((c) => c.name === "plan");
    await (planCmd?.options as { handler: (args: string, ctx: ExtensionContext) => Promise<void> }).handler("", ctx);

    const hook = mock.handlers.find((h) => h.event === "before_agent_start");
    const result = (await hook?.handler({}, ctx)) as {
      message?: { customType?: string; content?: string };
    } | undefined;

    expect(result?.message?.customType).toBe("plan-mode-context");
    expect(result?.message?.content).toContain("[PLAN MODE ACTIVE]");
  });
});
