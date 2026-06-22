import { describe, expect, test } from "bun:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createMockExtensionAPI, runTool } from "@aio-pi/shared/testing";
import todoListExtension from "./index.js";
import type { Todo } from "./utils.js";

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

describe("todo-list extension", () => {
  test("registers tool, command, shortcut, and session_start", () => {
    const mock = createMockExtensionAPI();
    todoListExtension(mock.api);

    expect(mock.tools).toHaveLength(1);
    expect(mock.tools[0]?.name).toBe("todo_write");
    expect(mock.commands.map((c) => c.name)).toEqual(["todo"]);
    expect(mock.shortcuts).toHaveLength(1);
    expect(mock.handlers.map((h) => h.event)).toContain("session_start");
  });

  test("todo_write merges todos and appends entry", async () => {
    const mock = createMockExtensionAPI();
    todoListExtension(mock.api);
    const ctx = createMockContext();
    const tool = mock.tools[0]!;

    const result = await runTool(
      tool,
      {
        merge: true,
        todos: [
          { id: "t1", content: "First task", status: "in_progress" },
          { id: "t2", content: "Second task", status: "pending" },
        ],
      },
      ctx,
    );

    expect(result.content).toEqual([{ type: "text", text: "0/2 done, 1 in progress" }]);
    expect(mock.entries).toHaveLength(1);
    expect(mock.entries[0]?.customType).toBe("todo-list");
    expect((mock.entries[0]?.data as { todos: Todo[] }).todos).toHaveLength(2);
  });

  test("/todo add and /todo done mutate state", async () => {
    const mock = createMockExtensionAPI();
    todoListExtension(mock.api);
    const ctx = createMockContext();
    const handler = (mock.commands[0]?.options as {
      handler: (args: string, ctx: ExtensionContext) => Promise<void>;
    }).handler;

    await handler("add Ship feature", ctx);
    await handler("done 1", ctx);

    expect(mock.entries).toHaveLength(2);
    const last = mock.entries.at(-1)?.data as { todos: Todo[] };
    expect(last.todos).toHaveLength(1);
    expect(last.todos[0]?.status).toBe("completed");
  });

  test("session_start restores todos from last entry", async () => {
    const mock = createMockExtensionAPI();
    todoListExtension(mock.api);

    const saved: Todo[] = [{ id: "r1", content: "Restored", status: "pending" }];
    const ctx = createMockContext({
      sessionManager: {
        getEntries: () => [
          { type: "custom", customType: "todo-list", data: { todos: saved } },
        ],
      } as unknown as ExtensionContext["sessionManager"],
    });

    let widgetLines: string[] | undefined;
    ctx.ui.setWidget = (_key, content) => {
      widgetLines = content as string[] | undefined;
    };

    const hook = mock.handlers.find((h) => h.event === "session_start");
    await hook?.handler({}, ctx);

    expect(widgetLines).toHaveLength(1);
    expect(widgetLines?.[0]).toContain("Restored");
  });
});
