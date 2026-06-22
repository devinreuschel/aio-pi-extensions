import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import {
  countByStatus,
  createTodo,
  formatTodoList,
  mergeTodos,
  parseStatusArg,
  removeTodo,
  resolveRef,
  setStatus,
  statusSymbol,
  summarizeTodos,
  type Todo,
} from "./utils.js";

const TodoStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
  Type.Literal("cancelled"),
]);

const TodoWriteParams = Type.Object({
  merge: Type.Optional(Type.Boolean()),
  todos: Type.Array(
    Type.Object({
      id: Type.String(),
      content: Type.String(),
      status: TodoStatusSchema,
    }),
  ),
});

function renderWidgetLines(todos: Todo[], ctx: ExtensionContext): string[] {
  return todos.map((item) => {
    switch (item.status) {
      case "completed":
        return (
          ctx.ui.theme.fg("success", statusSymbol(item.status) + " ") +
          ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.content))
        );
      case "in_progress":
        return ctx.ui.theme.fg("accent", `${statusSymbol(item.status)} ${item.content}`);
      case "cancelled":
        return ctx.ui.theme.fg("muted", `${statusSymbol(item.status)} ${item.content}`);
      case "pending":
        return `${ctx.ui.theme.fg("muted", statusSymbol(item.status) + " ")}${item.content}`;
    }
  });
}

export default function todoListExtension(pi: ExtensionAPI): void {
  let todos: Todo[] = [];
  let widgetVisible = true;

  function persist(): void {
    pi.appendEntry("todo-list", { todos });
  }

  function updateUI(ctx: ExtensionContext): void {
    const counts = countByStatus(todos);

    if (todos.length === 0 || !widgetVisible) {
      ctx.ui.setStatus("todo-list", undefined);
      ctx.ui.setWidget("todo-list", undefined);
      return;
    }

    ctx.ui.setStatus(
      "todo-list",
      ctx.ui.theme.fg("accent", `☑ ${counts.completed}/${counts.total}`),
    );
    ctx.ui.setWidget("todo-list", renderWidgetLines(todos, ctx));
  }

  function save(ctx: ExtensionContext): void {
    persist();
    updateUI(ctx);
  }

  pi.registerTool({
    name: "todo_write",
    label: "Todo write",
    description: "Create or update the session todo list. Use merge=true to update by id.",
    promptSnippet: "todo_write — track multi-step task progress",
    promptGuidelines: [
      "Use todo_write for non-trivial multi-step work.",
      "Create todos up front; keep exactly one in_progress.",
      "Mark completed immediately when a step finishes.",
      "Do not batch completion updates.",
    ],
    parameters: TodoWriteParams,
    execute: async (_id, params: Static<typeof TodoWriteParams>, _signal, _onUpdate, ctx) => {
      todos = mergeTodos(todos, params.todos, params.merge !== false);
      save(ctx);
      return {
        content: [{ type: "text", text: summarizeTodos(todos) }],
        details: { todos },
      };
    },
  });

  pi.registerCommand("todo", {
    description: "Manage session todos (list, add, start, done, cancel, rm, clear)",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed || trimmed === "list") {
        ctx.ui.notify(formatTodoList(todos), "info");
        return;
      }

      const space = trimmed.indexOf(" ");
      const action = space === -1 ? trimmed : trimmed.slice(0, space);
      const rest = space === -1 ? "" : trimmed.slice(space + 1).trim();

      if (action === "add") {
        if (!rest) {
          ctx.ui.notify("Usage: /todo add <text>", "warning");
          return;
        }
        todos = [...todos, createTodo(rest)];
        save(ctx);
        ctx.ui.notify(`Added: ${rest}`, "info");
        return;
      }

      if (action === "start" || action === "done" || action === "cancel") {
        if (!rest) {
          ctx.ui.notify(`Usage: /todo ${action} <#|id>`, "warning");
          return;
        }
        const item = resolveRef(todos, rest);
        if (!item) {
          ctx.ui.notify(`No todo matching "${rest}"`, "warning");
          return;
        }
        const status = parseStatusArg(action)!;
        todos = setStatus(todos, item.id, status);
        save(ctx);
        ctx.ui.notify(`${statusSymbol(status)} ${item.content}`, "info");
        return;
      }

      if (action === "rm") {
        if (!rest) {
          ctx.ui.notify("Usage: /todo rm <#|id>", "warning");
          return;
        }
        const item = resolveRef(todos, rest);
        if (!item) {
          ctx.ui.notify(`No todo matching "${rest}"`, "warning");
          return;
        }
        todos = removeTodo(todos, item.id);
        save(ctx);
        ctx.ui.notify(`Removed: ${item.content}`, "info");
        return;
      }

      if (action === "clear") {
        todos = [];
        save(ctx);
        ctx.ui.notify("Todo list cleared", "info");
        return;
      }

      ctx.ui.notify("Usage: /todo [list|add|start|done|cancel|rm|clear]", "warning");
    },
  });

  pi.registerShortcut(Key.ctrlAlt("t"), {
    description: "Toggle todo list widget",
    handler: async (ctx) => {
      widgetVisible = !widgetVisible;
      updateUI(ctx);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const entry = entries
      .filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "todo-list")
      .pop() as { data?: { todos?: Todo[] } } | undefined;

    if (entry?.data?.todos) {
      todos = entry.data.todos;
    }
    updateUI(ctx);
  });
}
